import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { env } from '@/env'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { toDate } from '@/lib/date-formatter'

import type { Interview } from '@/types/interviews'
import type { PostJob, Company } from '@coploy/domain'
import { createJobsService } from '@/lib/services/jobs-service'
import { createInterviewsService } from '@/lib/services/interviews-service'
import { COMPANY_PLANS } from '@/http/constants/company-free-constants'

// Cache system for interviews count
type InterviewsCountCacheEntry = {
  data: number
  timestamp: number
  expiresAt: number
}

const interviewsCountCache = new Map<string, InterviewsCountCacheEntry>()
const INTERVIEWS_COUNT_CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds

// Helper function to get cache key for interviews count
function getInterviewsCountCacheKey(companyId: string): string {
  return `interviews-count:${companyId}`
}

// Helper function to get cached interviews count data
function getCachedInterviewsCount(key: string): number | null {
  const entry = interviewsCountCache.get(key)
  if (!entry) {
    return null
  }

  if (Date.now() > entry.expiresAt) {
    interviewsCountCache.delete(key)
    return null
  }

  return entry.data
}

// Helper function to set cached interviews count data
function setCachedInterviewsCount(key: string, data: number): void {
  const now = Date.now()
  interviewsCountCache.set(key, {
    data,
    timestamp: now,
    expiresAt: now + INTERVIEWS_COUNT_CACHE_TTL,
  })
}

// Helper function to clean expired cache entries for interviews count
function cleanExpiredInterviewsCountCache(): void {
  const now = Date.now()
  for (const [key, entry] of interviewsCountCache.entries()) {
    if (now > entry.expiresAt) {
      interviewsCountCache.delete(key)
    }
  }
}

// Get a job by slug
export function getJob(app: FastifyInstance) {
  const jobsService = createJobsService(app.infra)
  const interviewsService = createInterviewsService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get<{
      Params: {
        slug: string
      }
    }>(
      '/companies/jobs/:slug',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Get job details with candidates metrics',
          params: z.object({
            slug: z.string(),
          }),
          response: {
            200: z
              .object({
                id: z.string(),
                interviewUrl: z.string(),
                /*
                 * Declarados, não deixados ao `.passthrough()`.
                 *
                 * O passthrough mantém o resto da vaga viva sem ter de declarar
                 * 46 campos, mas o que é declarado entra no contrato — e é assim
                 * que o SDK ganha tipo e a tela para de ler com `as`. Para campo
                 * novo, declarar é o caminho.
                 */
                evaluateLanguage: z.boolean(),
                orgUnitId: z.string().nullable(),
                customFieldValues: z.record(z.string(), z.unknown()),
                benefits: z.string().nullable(),
                salary: z.string().nullable(),
                candidatesMetrics: z.object({
                  totalCandidates: z.number(),
                  daysElapsed: z.number(),
                  dailyAverage: z.string(),
                  averageScore: z.string(),
                  status: z.object({
                    pending: z.number(),
                    selected: z.number(),
                    approved: z.number(),
                    rejected: z.number(),
                  }),
                  percentages: z.object({
                    pending: z.number(),
                    selected: z.number(),
                    approved: z.number(),
                    rejected: z.number(),
                  }),
                }),
              })
              .passthrough(),
          },
        },
      },
      async (request) => {
        const { slug } = request.params
        const { company } = await request.getUserMembership()
        const companyId = company.id

        const project = await jobsService.getJob(companyId, slug) as PostJob | null

        if (!project) {
          throw new BadRequestError(
            `Job não encontrado. Verifique se o ID do job (${slug}) está correto e se pertence à sua empresa.`
          )
        }

        // Buscar TODAS as interviews (não só finished) para métricas completas
        const interviews = await jobsService.listJobInterviews(
          companyId,
          slug,
          {}
        ) as Interview[]

        // SaaS não-enterprise: agregamos averageScore apenas sobre entrevistas
        // cujo score é "visível" (crédito consumido OU 1ª entrevista da empresa).
        // Em vagas de baixo volume, a média agregada de entrevistas mascaradas
        // revelaria o score individual — por isso aplicamos o mesmo helper de
        // mask usado em /companies/interviews.
        const companyDoc = (await app.infra.companyRepository.getCompany(
          companyId
        )) as Company | null
        const isEnterpriseCompany =
          companyDoc?.subscriptionPlan === COMPANY_PLANS.enterprise ||
          (companyDoc?.subscriptionDetails as { plan?: string } | null | undefined)?.plan ===
            COMPANY_PLANS.enterprise

        let interviewsForAvg: Array<{ score?: string | number | null; finished?: boolean }> =
          interviews.map((i) => ({ score: i.score, finished: i.finished }))

        if (!isEnterpriseCompany) {
          const normalized = interviews.map((i) => ({
            score: i.score,
            finished: i.finished,
            user_ref: i.user_ref?.id ?? null,
            job_applied_ref: i.job_applied_ref?.id ?? null,
            // Necessário pro check de cortesia SaaS (data < subscriptionTrial.startAt).
            date: i.date ?? null,
          }))
          interviewsForAvg = await interviewsService.applyListingScoreMask(
            companyId,
            normalized as unknown as Record<string, unknown>[]
          ) as typeof interviewsForAvg
        }

        // Calcular métricas de candidatos baseadas nas interviews
        const calculateCandidatesMetrics = () => {
          const totalCandidates = interviews.length

          // Contar candidatos por status baseado nas interviews
          const pendingCandidates = interviews.filter(
            (interview) => interview.candidate_status === 'Pending'
          ).length

          const selectedCandidates = interviews.filter(
            (interview) => interview.candidate_status === 'Selected'
          ).length

          const approvedCandidates = interviews.filter(
            (interview) => interview.candidate_status === 'Approved'
          ).length

          const rejectedCandidates = interviews.filter(
            (interview) => interview.candidate_status === 'Rejected'
          ).length

          // Calcular dias decorridos desde a criação da vaga (Firestore Timestamp ou MongoDB Date/number)
          const timeCreatedMs = toDate(project?.timeCreated)?.getTime() ?? Date.now()
          const daysElapsed = Math.floor(
            (Date.now() - timeCreatedMs) / (1000 * 60 * 60 * 24)
          )

          // Calcular média diária de candidatos
          const dailyAverage =
            daysElapsed > 0
              ? (totalCandidates / daysElapsed).toFixed(1)
              : totalCandidates.toString()

          // Helper para converter score para número válido
          const parseValidScore = (score: any): number => {
            if (!score) return 0
            const numericScore =
              typeof score === 'string' ? Number.parseFloat(score) : score
            return typeof numericScore === 'number' &&
              !Number.isNaN(numericScore)
              ? numericScore
              : 0
          }

          type InterviewLike = { score?: string | number | null; finished?: boolean }

          function isFinishedWithVisibleScore(interview: InterviewLike): boolean {
            // SaaS non-enterprise: applyListingScoreMask zera score → null.
            // Esses entram como "sem score visível" e não contam pra média.
            return (
              interview.finished === true &&
              interview.score !== undefined &&
              interview.score !== null
            )
          }

          function getFinishedInterviewsWithScore(
            items: InterviewLike[]
          ): InterviewLike[] {
            return items.filter(isFinishedWithVisibleScore)
          }

          // Soma os scores válidos
          function getInterviewScoreSum(
            sum: number,
            interview: InterviewLike
          ): number {
            return sum + parseValidScore(interview.score)
          }

          function getTotalScore(items: InterviewLike[]): number {
            return items.reduce(getInterviewScoreSum, 0)
          }

          // Calcular média de pontuação das entrevistas finalizadas (e visíveis)
          function calculateAverageScore(items: InterviewLike[]): string {
            const finishedInterviews =
              getFinishedInterviewsWithScore(items)

            if (finishedInterviews.length === 0) return '0.0'

            const totalScore = getTotalScore(finishedInterviews)

            return (totalScore / finishedInterviews.length).toFixed(1)
          }

          const averageScore = calculateAverageScore(interviewsForAvg)

          // Calcular porcentagens
          const calculatePercentage = (value: number) => {
            if (totalCandidates === 0) {
              return 0
            }
            return Number(((value / totalCandidates) * 100).toFixed(1))
          }

          return {
            totalCandidates,
            daysElapsed,
            dailyAverage,
            averageScore,
            status: {
              pending: pendingCandidates,
              selected: selectedCandidates,
              approved: approvedCandidates,
              rejected: rejectedCandidates,
            },
            percentages: {
              pending: calculatePercentage(pendingCandidates),
              selected: calculatePercentage(selectedCandidates),
              approved: calculatePercentage(approvedCandidates),
              rejected: calculatePercentage(rejectedCandidates),
            },
          }
        }

        const candidatesMetrics = calculateCandidatesMetrics()

        const interviewUrl = `${env.INTERVIEW_BASE_URL}/job/${slug}/company/${company.id}`

        return {
          // Dados principais controlados - SEM spread operator para evitar exposição de DocumentReference
          id: slug,
          jobName: project?.jobName || '',
          jobDescription: project?.jobDescription || '',
          jobCategories: project?.jobCategories || '',
          jobId: project?.jobId || null,
          carrerLevel: project?.carrerLevel || '',
          stopped: project?.stopped || false,
          public: project?.public || false,
          priority: project?.priority ?? false,
          typeInterview: project?.typeInterview || '',
          archived: project?.archived || false,
          evaluation: project?.evaluation || {},
          limitNumberJobVacancies: project?.limitNumberJobVacancies || '0',
          limitedJobVacancy: project?.limitedJobVacancy || false,
          jobResponsabilities: project?.jobResponsabilities || '',
          jobRequirements: project?.jobRequirements || '',
          // fallback pro metadata legado que só o Motor preenchia
          benefits: project?.benefits ?? project?.jobDescriptionMetadata?.benefits ?? null,
          salary: project?.salary ?? project?.jobDescriptionMetadata?.salary ?? null,
          structuredRequirements: project?.structuredRequirements || [],
          jobHours: project?.jobHours || '',
          infoJobsBool: project?.infoJobsBool || false,
          employmentType: project?.employmentType || '',
          educationalRequiements: project?.educationalRequiements || [''],
          address: project?.address || { city: '', state: '', country: '' },
          language: project?.language || '',
          jobModel: project?.jobModel || '',
          interviewMode: project?.interviewMode || 'video',
          identifier: project?.identifier || '',
          additionalQuestions: project?.additionalQuestions || [],
          competencias_criticas: project?.competencias_criticas || '',
          competencias_adicionais: project?.competencias_adicionais || '',
          expectativas: project?.expectativas || '',
          /*
           * A resposta é uma LISTA EXPLÍCITA (sem spread, para não vazar
           * DocumentReference) — então campo novo que não é adicionado aqui é
           * gravado e nunca devolvido. Foi o que aconteceu com estes dois: a
           * escrita funcionava, a validação funcionava, e a tela abria em branco.
           */
          /*
           * Sem isto, editar uma vaga DESLIGAVA a avaliação de idioma: o
           * formulário lê `job.evaluateLanguage` para montar o rascunho, recebia
           * `undefined`, virava `false`, e o PUT — que manda o rascunho inteiro —
           * gravava desligado. Ninguém digitou nada e a configuração sumiu.
           */
          evaluateLanguage: project?.evaluateLanguage === true,
          orgUnitId: project?.orgUnitId ?? null,
          customFieldValues: project?.customFieldValues ?? {},
          jobQuestions: project?.jobQuestions || [],
          /*
           * Anti-ghosting e ghost job (TOS-026 / V2-604).
           *
           * Esta rota monta a resposta por allowlist — o que não é listado aqui
           * não chega na tela. A seção de régua de resposta lia `feedbackSlaHours`
           * que NUNCA vinha, então uma vaga com régua configurada aparecia como
           * "ainda não tem régua" e o recrutador reconfigurava por cima.
           */
          antiGhostingEnabled: project?.antiGhostingEnabled ?? null,
          feedbackSlaHours: project?.feedbackSlaHours ?? null,
          slaIrregularSince: project?.slaIrregularSince ?? null,
          hiringIntent: project?.hiringIntent ?? null,
          freshnessSlaDays: project?.freshnessSlaDays ?? null,
          // ✅ CAMPOS DE TRIAGEM (WhatsApp) - Retornar do backend
          contractType: project?.contractType || '',
          screeningObjective: project?.screeningObjective || '',
          workModality: project?.workModality || '',
          mainSkills: project?.mainSkills || '',
          minimumAge: project?.minimumAge,
          requiresPreviousExperience:
            project?.requiresPreviousExperience ?? false,

          // Dados temporais convertidos corretamente (Firestore ou MongoDB)
          timeCreated: toDate(project?.timeCreated) ?? undefined,
          closingDate: toDate(project?.closingDate) ?? undefined,

          // Referências convertidas para IDs simples (SEGURO)
          uid: project?.uid?.id,
          infoJobs: project?.infoJobs?.id,

          // IDs de usuários aplicados - APENAS IDs, sem DocumentReference
          usersApplied:
            project?.usersApplied
              ?.map((userRef: any) => {
                // Se for DocumentReference, extrair apenas o ID
                if (userRef?._path?.segments) {
                  return userRef._path.segments[
                    userRef._path.segments.length - 1
                  ]
                }
                // Se já for string, retornar como está
                if (typeof userRef === 'string') {
                  return userRef
                }
                // Se for outro formato, retornar null
                return null
              })
              .filter((id: any) => id !== null) || [],

          // Dados calculados
          interviewUrl,
          candidatesMetrics,

          // Descrição gerada por IA (persistida no postJob)
          generatedJobDescription:
            project?.generatedJobDescription || undefined,
          jobDescriptionMetadata: project?.jobDescriptionMetadata
            ? {
                companyDescription:
                  project.jobDescriptionMetadata.companyDescription ||
                  undefined,
                contractType:
                  project.jobDescriptionMetadata.contractType || undefined,
                benefits: project.jobDescriptionMetadata.benefits || undefined,
                salary: project.jobDescriptionMetadata.salary || undefined,
                generatedAt: (() => {
                  const ga = project.jobDescriptionMetadata?.generatedAt
                  if (!ga) return undefined
                  const d = toDate(ga)
                  if (d) return d.toISOString()
                  return typeof ga === 'string' ? ga : undefined
                })(),
                generatedBy:
                  project.jobDescriptionMetadata.generatedBy || undefined,
              }
            : undefined,

          // uid_notification_message — resolver DocumentReference → string ID
          notificationMessage: (() => {
            const ref = project?.uid_notification_message
            if (!ref) return null
            // EntityRef normalizado
            if (ref.id) return ref.id
            // DocumentReference com path
            if ((ref as unknown as Record<string, unknown>).path) {
              const path = (ref as unknown as Record<string, unknown>).path as string
              return path.split('/').pop() || null
            }
            // String direta
            if (typeof ref === 'string') return ref
            return null
          })(),
        }
      }
    )
}

// Count the number of jobs
export function countJobs(app: FastifyInstance) {
  const jobsService = createJobsService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get(
      '/companies/jobs/count',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Count the number of jobs',
        },
      },
      async (request) => {
        const { company } = await request.getUserMembership()
        const jobs = await jobsService.listJobs(company.id)
        return jobs.length
      }
    )
}

// Get all interviews count
export function getInterviewsCount(app: FastifyInstance) {
  const jobsService = createJobsService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get(
      '/companies/jobs/interviews/count',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Get all interviews count',
        },
      },
      async (request) => {
        const { company } = await request.getUserMembership()

        // Clean expired cache entries
        cleanExpiredInterviewsCountCache()

        // Generate cache key
        const cacheKey = getInterviewsCountCacheKey(
          company.id
        )

        // Try to get cached data first
        const cachedCount = getCachedInterviewsCount(cacheKey)
        if (cachedCount !== null) {
          return cachedCount
        }

        const interviews = await jobsService.listCompanyInterviews(
          company.id,
          {
            filters: [
              {
                field: 'finished',
                operator: '==',
                value: true,
              },
            ],
          }
        )

        const interviewsCount = interviews.length

        // Cache the result
        setCachedInterviewsCount(cacheKey, interviewsCount)
        return interviewsCount
      }
    )
}

// Get total candidates count across all jobs
export function getTotalCandidatesCount(app: FastifyInstance) {
  const jobsService = createJobsService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get(
      '/companies/jobs/candidates/count',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Get total candidates count across all jobs',
          response: {},
        },
      },
      async (request) => {
        const { company } = await request.getUserMembership()
        const jobs = await jobsService.listJobs(company.id)
        const totalCandidates = jobs.reduce((total, job) => {
          return total + (job.usersApplied?.length || 0)
        }, 0)

        return totalCandidates
      }
    )
}
