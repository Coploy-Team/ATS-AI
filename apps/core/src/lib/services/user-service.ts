import type { InfraProvider } from '@coploy/infra'
import type { Company, QueryFilter, JobApplied, CandidateLike } from '@coploy/domain'
import { isCourtesyInterview } from '@/lib/saas-courtesy'
import { COMPANY_PLANS } from '@/http/constants/company-free-constants'
import { toDate } from '@/lib/date-formatter'
import { deriveAuthenticityConfidence } from '@/lib/cheat-confidence'

/**
 * Determines if the interview score should be visible for a SaaS
 * (non-enterprise) company.
 *
 * Returns true when any of these hold:
 *   1. Company is enterprise or within enterprise grace period.
 *   2. The interview was unlocked via credit.
 *   3. The interview was finished BEFORE `company.subscriptionTrial.startAt`
 *      (SaaS courtesy window — substitutes the legacy "first finished
 *      interview" exception).
 *
 * Score must remain null in all other cases — this is a security rule,
 * not just a UI preference. Pure function: no infra access required.
 * Kept as a standalone function (not a `this`-bound object method) so it
 * can be called safely from other methods on the service object.
 */
function resolveInterviewScoreAccess(params: {
  company: Pick<Company, 'subscriptionTrial'> | null | undefined
  interviewDate: Date | string | number | null | undefined
  isEnterprise: boolean
  withinEnterpriseGrace: boolean
  hasCredit: boolean
}): boolean {
  const { company, interviewDate, isEnterprise, withinEnterpriseGrace, hasCredit } = params
  if (isEnterprise || withinEnterpriseGrace || hasCredit) return true
  return isCourtesyInterview(company, interviewDate)
}

export function createUserService(infra: InfraProvider) {
  return {
    async getJobApplied(userId: string, jobAppliedId: string) {
      return infra.candidateRepository.getJobApplied(userId, jobAppliedId)
    },
    async listCandidateLikes(userId: string, jobAppliedId: string) {
      return infra.candidateRepository.listCandidateLikes(userId, jobAppliedId)
    },
    async listCreditsUsed(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc'; limitTo?: number }) {
      return infra.billingRepository.listCreditsUsed(companyId, options)
    },

    /**
     * Builds the viewer-facing jobApplied detail with the same
     * credit/enterprise/cortesia masking rules used by
     * `GET /users/:userId/jobs-applied/:jobAppliedId`. Extracted so the
     * share-link endpoint can reuse the exact same masking (never revealing
     * more than the authenticated viewer would see) before applying its own
     * section-level cut on top.
     *
     * Returns `null` when the jobApplied record doesn't exist.
     */
    async buildViewerJobAppliedDetail(params: {
      userId: string
      jobAppliedId: string
      membership: { company: Company }
    }): Promise<{ jobApplied: Record<string, unknown> } | null> {
      const { userId, jobAppliedId, membership } = params
      const companyId = membership.company.id
      const isEnterprise =
        membership?.company?.subscriptionPlan === COMPANY_PLANS.enterprise ||
        (membership?.company?.subscriptionDetails as any)?.plan === COMPANY_PLANS.enterprise

      const jobAppliedData = (await infra.candidateRepository.getJobApplied(
        userId,
        jobAppliedId,
      )) as JobApplied | null

      if (!jobAppliedData) {
        return null
      }

      // Carrega o doc completo da empresa do viewer pra ler
      // `subscriptionDetails.enterpriseEndedAt` e
      // `subscriptionTrial.startAt`. `getUserMembership` pode trazer
      // uma versão sumarizada sem o trial, então não confiamos só
      // na membership.
      const viewerCompanyDoc = companyId
        ? ((await infra.companyRepository.getCompany(
          companyId,
        ).catch(() => null)) as
          | (typeof membership.company & {
            subscriptionTrial?: { startAt?: Date | string | null } | null
          })
          | null)
        : null

      // Período de graça enterprise → free: se a empresa saiu do
      // enterprise (subscriptionDetails.enterpriseEndedAt setado) e a
      // entrevista é ANTERIOR ao corte, libera tudo igual enterprise
      // (sem masking, sem cobrança).
      const enterpriseEndedAtRaw =
        (viewerCompanyDoc?.subscriptionDetails as any)?.enterpriseEndedAt ??
        (membership?.company?.subscriptionDetails as any)?.enterpriseEndedAt
      const enterpriseEndedAt = enterpriseEndedAtRaw
        ? enterpriseEndedAtRaw instanceof Date
          ? enterpriseEndedAtRaw
          : new Date(enterpriseEndedAtRaw)
        : null
      const interviewDateRaw =
        jobAppliedData.finishedTime ??
        jobAppliedData.appliedTime ??
        (jobAppliedData.interview as any)?.dateTime ??
        (jobAppliedData.interview as any)?.date ??
        null
      const interviewDate = interviewDateRaw
        ? interviewDateRaw instanceof Date
          ? interviewDateRaw
          : new Date(interviewDateRaw as string)
        : null
      let withinEnterpriseGrace = false
      if (enterpriseEndedAt) {
        if (
          interviewDate &&
          !Number.isNaN(interviewDate.getTime()) &&
          interviewDate.getTime() < enterpriseEndedAt.getTime()
        ) {
          withinEnterpriseGrace = true
        }
      }

      // Cortesia SaaS: entrevistas finalizadas ANTES de
      // `subscriptionTrial.startAt` são liberadas em cortesia
      // (nota + conteúdo), mesmo padrão do enterprise grace.
      const isCourtesy = isCourtesyInterview(
        viewerCompanyDoc as any,
        interviewDate,
      )

      const likes = (await infra.candidateRepository.listCandidateLikes(
        userId,
        jobAppliedId,
      )) as CandidateLike[]

      if (isEnterprise || withinEnterpriseGrace || isCourtesy) {
        const jobAppliedResult = {
          ...jobAppliedData,
          id: jobAppliedId,
          appliedTime: toDate(jobAppliedData.appliedTime),
          companyOwner: jobAppliedData.companyOwner?.id ?? null,
          finishedTime: toDate(jobAppliedData.finishedTime),
          dateSelect: toDate(jobAppliedData.dateSelect),
          userApplied: jobAppliedData.userApplied?.id ?? null,
          jobApplied: jobAppliedData.jobApplied?.id ?? null,
          likes: likes.map((like) => ({
            ...like,
            created_at: toDate(like.created_at),
            action: like?.action ?? true,
          })),
          totalLikes: likes.filter(
            (like) => like.action === true || like.action === undefined,
          ).length,
          totalDislikes: likes.filter((like) => like.action === false)
            .length,
          exitJobResult: jobAppliedData.exitJobResult || null,
          interview: jobAppliedData.interview
            ? {
              ...jobAppliedData.interview,
              cheat: deriveAuthenticityConfidence(
                jobAppliedData.interview.cheat as Record<string, unknown> | null | undefined,
                jobAppliedData.interview.info as Array<Record<string, unknown>> | null | undefined,
              ),
            }
            : null,
          whatsappTriagemResult:
            jobAppliedData.whatsappTriagemResult || null,
        }

        return { jobApplied: jobAppliedResult }
      }

      // ==========================
      // 2) NÃO-ENTERPRISE → aplicar regra de créditos
      // ==========================
      let hasCredit = false
      let hasAuthenticityAnalysisCredit = false

      if (companyId) {
        // Verificar se a empresa comprou a entrevista
        const used = await infra.billingRepository.listCreditsUsed(
          companyId,
          {
            filters: [
              { field: 'userId', operator: '==', value: userId },
              { field: 'jobApplied', operator: '==', value: jobAppliedId },
            ],
            limitTo: 1,
          },
        )
        hasCredit = Array.isArray(used) && used.length > 0

        // Verificar se a empresa comprou a análise de autenticidade (SEPARADO)
        const authenticityUsed = await infra.billingRepository.listCreditsUsed(
          companyId,
          {
            filters: [
              { field: 'feature', operator: '==', value: 'authenticity_analysis' },
              { field: 'userId', operator: '==', value: userId },
              { field: 'jobApplied', operator: '==', value: jobAppliedId },
            ],
            limitTo: 1,
          },
        )
        hasAuthenticityAnalysisCredit = Array.isArray(authenticityUsed) && authenticityUsed.length > 0
      }

      // SaaS: score visível só quando hasCredit OU dentro da janela
      // de cortesia (data < subscriptionTrial.startAt). Cortesia já
      // foi tratada como grace acima (branch enterprise/grace), então
      // neste ponto só sobra hasCredit; mantemos o helper pra cobrir
      // fluxos sem company resolvido.
      const showScore = resolveInterviewScoreAccess({
        company: viewerCompanyDoc as any,
        interviewDate,
        isEnterprise: false,
        withinEnterpriseGrace: false,
        hasCredit,
      })

      const maskInterview = (interview: any) => {
        if (!interview) return null
        const scoreNum =
          typeof interview?.score === 'string'
            ? Number.parseFloat(interview.score) || 0
            : interview?.score || 0
        return {
          cheat: null,
          masked: true,
          type_interview: interview?.type_interview ?? null,
          job_name: interview?.job_name ?? null,
          score: showScore ? scoreNum : null,
          date: interview?.date ?? null,
        }
      }

      const maskExitJobResult = (exitJobResult: any) => {
        if (!exitJobResult) return null
        return {
          masked: true,
          message: 'Dados de exitJob disponíveis após pagamento de crédito',
          executive_summary: null,
          resignation_reasons: null,
          mapped_emotions: null,
          negative_aspects: null,
          positive_aspects: null,
          extra_insights: null,
          improvement_actions: null,
          reasons_over_time: null,
        }
      }

      const maskWhatsappTriagemResult = (whatsappTriagemResult: any) => {
        if (!whatsappTriagemResult) return null
        return {
          masked: true,
          message:
            'Dados de triagem WhatsApp disponíveis após pagamento de crédito',
          feedback_geral: null,
          porcentagem_match: null,
          recomendacao_recrutador: null,
          requisitos_atendidos: null,
          requisitos_nao_atendidos: null,
          pontos_atencao: null,
        }
      }

      const fullInterview = jobAppliedData.interview
        ? {
          ...jobAppliedData.interview,
          cheat: hasAuthenticityAnalysisCredit
            ? deriveAuthenticityConfidence(
              jobAppliedData.interview.cheat as Record<string, unknown> | null | undefined,
              jobAppliedData.interview.info as Array<Record<string, unknown>> | null | undefined,
            )
            : null,
        }
        : null

      const fullExitJobResult =
        jobAppliedData.exitJobResult || null

      const fullWhatsappTriagemResult =
        jobAppliedData.whatsappTriagemResult || null

      const interviewForResponse = hasCredit
        ? fullInterview
        : maskInterview(jobAppliedData.interview)

      const exitJobResultForResponse = hasCredit
        ? fullExitJobResult
        : maskExitJobResult(fullExitJobResult)

      const whatsappTriagemResultForResponse = hasCredit
        ? fullWhatsappTriagemResult
        : maskWhatsappTriagemResult(fullWhatsappTriagemResult)

      const jobAppliedResult = {
        ...jobAppliedData,
        id: jobAppliedId,
        appliedTime: toDate(jobAppliedData.appliedTime),
        companyOwner: jobAppliedData.companyOwner?.id ?? null,
        finishedTime: toDate(jobAppliedData.finishedTime),
        dateSelect: toDate(jobAppliedData.dateSelect),
        userApplied: jobAppliedData.userApplied?.id ?? null,
        jobApplied: jobAppliedData.jobApplied?.id ?? null,
        likes: likes.map((like) => ({
          ...like,
          created_at: toDate(like.created_at),
          action: like?.action ?? true,
        })),
        totalLikes: likes.filter(
          (like) => like.action === true || like.action === undefined,
        ).length,
        totalDislikes: likes.filter((like) => like.action === false).length,
        exitJobResult: exitJobResultForResponse,
        interview: interviewForResponse,
        // ✅ WhatsApp Triagem Result - Mascarado se não tiver crédito
        whatsappTriagemResult: whatsappTriagemResultForResponse,
      }

      return { jobApplied: jobAppliedResult }
    },

    resolveInterviewScoreAccess,
  }
}
