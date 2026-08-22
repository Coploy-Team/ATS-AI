import { BadRequestError } from '@coploy/shared/errors'
import type { InfraProvider } from '@coploy/infra'
import type { JobApplied, PostJob, UsersCompany } from '@coploy/domain'

interface ConsumeCreditsParams {
  companyId: string
  feature: string
  companyOwner: string
  userId: string
  jobApplied: string
  postJobId?: string // Opcional para features como fast_track
  usedBy: any
  ip: string | null
  userAgent: string | null
}

interface ConsumeCreditsResult {
  used: boolean
  alreadyUsed: boolean
  creditId?: string
}

export function createCreditsService(infra: InfraProvider) {
  return {
    /**
     * Consome 1 crédito da empresa e registra em companies/{companyId}/creditsUsed
     * Idempotente por (feature, userId, jobApplied)
     */
    async consumeCredit(
      params: ConsumeCreditsParams
    ): Promise<ConsumeCreditsResult> {
      const {
        companyId,
        feature,
        companyOwner,
        userId,
        jobApplied,
        postJobId,
        usedBy,
        ip,
        userAgent,
      } = params

      console.log('🔄 [CreditsService] consumeCredit iniciado:', {
        companyId,
        feature,
        userId,
        jobApplied,
        postJobId: postJobId || 'N/A',
      })

      // ============================
      // 🔹 Verificar idempotência
      // ============================
      let existing: any[] = []
      try {
        console.log('🔍 [CreditsService] Verificando idempotência...')
        existing = await infra.billingRepository.listCreditsUsed(companyId, {
          filters: [
            { field: 'feature', operator: '==', value: feature },
            { field: 'userId', operator: '==', value: userId },
            { field: 'jobApplied', operator: '==', value: jobApplied },
          ],
          limitTo: 1,
        })
        console.log('📊 [CreditsService] Registros existentes:', existing.length)
      } catch (err) {
        console.error('❌ [CreditsService] Erro ao verificar idempotência:', err)
        throw new BadRequestError(
          `Erro ao verificar uso anterior de créditos: ${String(err)}`
        )
      }

      if (existing && existing.length > 0) {
        console.log(
          '⚠️ [CreditsService] Crédito já consumido anteriormente:',
          existing[0]?.id
        )
        return {
          used: false,
          alreadyUsed: true,
          creditId: existing[0]?.id ?? undefined,
        }
      }

      // ============================
      // 🔹 Carregar empresa (precisa antes do bypass enterprise)
      // ============================
      const companyFull = (await infra.companyRepository.getCompany(companyId)) as {
        subscriptionCredits?: { creditsMonthly?: number; creditsCourtesy?: number; creditsFixed?: number }
        subscriptionDetails?: { enterpriseEndedAt?: Date | string | null } | null
      } | null

      if (!companyFull) {
        console.error('❌ [CreditsService] Empresa não encontrada:', companyId)
        throw new BadRequestError('Empresa não encontrada para débito de crédito')
      }

      // ============================
      // 🔹 Bypass enterprise → free
      // ============================
      // Se a empresa tem `enterpriseEndedAt` setado (saiu de enterprise pra
      // free) e a entrevista alvo (jobApplied) foi finalizada ANTES dessa
      // data, libera sem cobrar crédito — esses desbloqueios já foram
      // pagos pelo contrato enterprise vigente.
      const enterpriseEndedAtRaw = companyFull.subscriptionDetails?.enterpriseEndedAt
      const enterpriseEndedAt = enterpriseEndedAtRaw
        ? enterpriseEndedAtRaw instanceof Date
          ? enterpriseEndedAtRaw
          : new Date(enterpriseEndedAtRaw)
        : null

      if (enterpriseEndedAt && feature !== 'job_description') {
        try {
          const ja = (await infra.candidateRepository.getJobApplied(
            userId,
            jobApplied,
          )) as JobApplied | null
          // Tenta finishedTime; cai pra appliedTime; cai pra interview.dateTime
          const interviewDate =
            (ja?.finishedTime as Date | string | null | undefined) ??
            (ja?.appliedTime as Date | string | null | undefined) ??
            (ja?.interview?.dateTime as Date | string | null | undefined) ??
            null

          const interviewDateNormalized = interviewDate
            ? interviewDate instanceof Date
              ? interviewDate
              : new Date(interviewDate)
            : null

          if (
            interviewDateNormalized &&
            interviewDateNormalized.getTime() < enterpriseEndedAt.getTime()
          ) {
            console.log(
              '✨ [CreditsService] Bypass enterprise: entrevista anterior ao corte, sem débito',
              {
                companyId,
                jobApplied,
                interviewDate: interviewDateNormalized.toISOString(),
                enterpriseEndedAt: enterpriseEndedAt.toISOString(),
              },
            )

            // Registra o uso (audit trail) sem debitar nenhum bucket de crédito.
            const now = new Date()
            const enterprisePayload = {
              feature,
              companyOwner,
              userId,
              jobApplied,
              postJobId,
              usedAt: now,
              usedBy,
              ip,
              userAgent,
              source: 'api',
              debitedFrom: 'enterprise_grace' as const,
              candidateName: null,
              jobName: null,
              score: null,
              isHunting: false,
            }
            try {
              const res = await infra.billingRepository.createCreditsUsed(
                companyId,
                enterprisePayload,
              )
              const createdId = (res as { id?: string })?.id ?? undefined
              return { used: true, alreadyUsed: false, creditId: createdId }
            } catch (err) {
              console.error(
                '⚠️ [CreditsService] Falha ao registrar bypass enterprise (liberando mesmo assim):',
                err,
              )
              return { used: true, alreadyUsed: false }
            }
          }
        } catch (err) {
          // Se falhar a checagem, segue fluxo normal (cobrança).
          console.warn(
            '[CreditsService] Falha ao avaliar bypass enterprise, seguindo fluxo padrão:',
            err,
          )
        }
      }

      // ============================
      // 🔹 Debitar crédito da empresa
      // ============================
      let debitedFrom: 'monthly' | 'courtesy' | 'fixed' | null = null
      try {
        console.log('💰 [CreditsService] Iniciando débito de crédito...')
        const company = companyFull

        const currentCredits = (company.subscriptionCredits as {
          creditsMonthly?: number
          creditsCourtesy?: number
          creditsFixed?: number
        }) || { creditsMonthly: 0, creditsCourtesy: 0, creditsFixed: 0 }

        console.log('📊 [CreditsService] Saldo atual:', currentCredits)

        let {
          creditsMonthly = 0,
          creditsCourtesy = 0,
          creditsFixed = 0,
        } = currentCredits

        // Ordem de prioridade: monthly > courtesy > fixed
        if (creditsMonthly > 0) {
          creditsMonthly -= 1
          debitedFrom = 'monthly'
        } else if (creditsCourtesy > 0) {
          creditsCourtesy -= 1
          debitedFrom = 'courtesy'
        } else if (creditsFixed > 0) {
          creditsFixed -= 1
          debitedFrom = 'fixed'
        }

        if (!debitedFrom) {
          console.error(
            '❌ [CreditsService] Sem créditos disponíveis:',
            currentCredits
          )
          throw new BadRequestError('Saldo de créditos insuficiente')
        }

        console.log('✅ [CreditsService] Crédito debitado de:', debitedFrom)
        console.log('💳 [CreditsService] Novo saldo:', {
          creditsMonthly,
          creditsCourtesy,
          creditsFixed,
        })

        await infra.companyRepository.updateCompany(companyId, {
          subscriptionCredits: {
            creditsMonthly,
            creditsCourtesy,
            creditsFixed,
          },
        })
        console.log('✅ [CreditsService] Saldo atualizado no Firestore')
      } catch (err) {
        console.error('❌ [CreditsService] Erro ao debitar crédito:', err)
        throw new BadRequestError(
          `Erro ao debitar crédito da empresa: ${String(err)}`
        )
      }

      // ============================
      // 🔹 Buscar dados enriquecidos
      // ============================
      let candidateName: string | null = null
      let jobName: string | null = null
      let score: number | null = null
      let isHunting = false
      let usedByName: string | null = null

      try {
        // 0. Buscar nome do usuário que consumiu (recruiter logado)
        try {
          const usedByUser = (await infra.userRepository.getUsersCompany(
            usedBy as string,
          )) as UsersCompany | null
          usedByName =
            usedByUser?.display_name ||
            usedByUser?.first_name ||
            usedByUser?.email ||
            null
        } catch (error) {
          console.error(`Erro ao buscar usedBy ${usedBy}:`, error)
        }

        if (feature === 'job_description') {
          // job_description: jobApplied = postJobId, userId = company.id (sem candidato)
          try {
            const jobData = (await infra.jobRepository.getJob(
              companyId,
              postJobId || jobApplied,
            )) as PostJob | null
            jobName = jobData?.jobName || null
          } catch (error) {
            console.error(
              `Erro ao buscar postJob ${postJobId || jobApplied}:`,
              error
            )
          }
        } else {
          // Outras features: fluxo normal com candidato
          try {
            const userData = (await infra.userRepository.getUser(userId)) as UsersCompany | null
            candidateName = userData?.display_name || null
          } catch (error) {
            console.error(`Erro ao buscar candidato ${userId}:`, error)
          }

          try {
            const jobAppliedData = (await infra.candidateRepository.getJobApplied(
              userId,
              jobApplied,
            )) as JobApplied | null

            if (jobAppliedData) {
              const interviewScore =
                jobAppliedData.interview?.score || jobAppliedData.score
              score =
                typeof interviewScore === 'number'
                  ? interviewScore
                  : typeof interviewScore === 'string'
                    ? Number.parseFloat(interviewScore)
                    : null

              const jobAppliedRef = jobAppliedData.jobApplied as { path?: string } | undefined
              if (jobAppliedRef?.path) {
                try {
                  const jobPath = jobAppliedRef.path.split('/')
                  const companyIdFromPath = jobPath[1]
                  const jobIdFromPath = jobPath[3]
                  const jobData = companyIdFromPath && jobIdFromPath
                    ? (await infra.jobRepository.getJob(companyIdFromPath, jobIdFromPath)) as PostJob | null
                    : null
                  jobName = jobData?.jobName || null
                  isHunting = companyIdFromPath !== companyId
                } catch (error) {
                  console.error(`Erro ao buscar vaga ${postJobId}:`, error)
                }
              }
            }
          } catch (error) {
            console.error(`Erro ao buscar jobApplied ${jobApplied}:`, error)
          }
        }
      } catch (error) {
        console.error('Erro ao buscar dados enriquecidos:', error)
      }

      // ============================
      // 🔹 Registrar uso do crédito
      // ============================
      const now = new Date()
      const payload = {
        feature,
        companyOwner,
        userId,
        jobApplied,
        postJobId,
        usedAt: now,
        usedBy,
        usedByName,
        ip,
        userAgent,
        source: 'api',
        debitedFrom,
        candidateName,
        jobName,
        score,
        isHunting,
      }

      let createdId: string | undefined
      try {
        const res = await infra.billingRepository.createCreditsUsed(
          companyId,
          payload,
        )
        createdId = (res as { id?: string })?.id ?? undefined
      } catch (err) {
        throw new BadRequestError(
          `Erro ao registrar uso de crédito: ${String(err)}`
        )
      }

      return {
        used: true,
        alreadyUsed: false,
        creditId: createdId,
      }
    },
  }
}

