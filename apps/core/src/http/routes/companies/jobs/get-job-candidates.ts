import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'

/**
 * Subconjunto TIPADO do candidato que a UI de pipeline consome. O objeto real
 * é o CompanyInterview mapeado (legado, chaves mistas) — `.passthrough()`
 * mantém o resto intacto: tipar não pode estripar campo de consumidor atual.
 */
const jobCandidateSchema = z
	.object({
		id: z.string(),
		name: z.string().nullish(),
		email: z.string().nullish(),
		photo_url: z.string().nullish(),
		occupation: z.string().nullish(),
		score: z.union([z.string(), z.number()]).nullish(),
		candidateStatus: z.string().nullish(),
		/** Data da candidatura. */
		date: z.date().nullish(),
		/** Entrou na etapa atual em — base do "tempo na etapa" no kanban. */
		date_select: z.date().nullish(),
		finished: z.boolean().nullish(),
		job_applied_ref: z.string().nullish(),
		user_ref: z.string().nullish(),
		authenticityScore: z.number().nullish(),
		/** Perguntas já respondidas — separa "nunca abriu" de "parou no meio". */
		answeredCount: z.number().nullish(),
								/** Bloqueado por crédito (SaaS) — diferente de 'ainda sem nota'. */
								locked: z.boolean().optional(),
	})
	.passthrough()
import { createAuth } from '@/http/routes/middlewares/auth'
import { COMPANY_PLANS } from '@/http/constants/company-free-constants'
import { toDate } from '@/lib/date-formatter'

import type { Interview } from '@/types/interviews'
import type { JobApplied, PostJob } from '@coploy/domain'
import { createJobsService } from '@/lib/services/jobs-service'
import { createInterviewsService } from '@/lib/services/interviews-service'

export function getJobCandidates(app: FastifyInstance) {
  const jobsSvc = createJobsService(app.infra)
  const interviewsSvc = createInterviewsService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get(
      '/companies/jobs/:jobId/candidates',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Get candidates for a specific job with pagination',
          description:
            'Get all candidates (interviews) for a specific job with full pagination support',
          params: z.object({
            jobId: z.string().describe('The job ID'),
          }),
          querystring: z.object({
            page: z.string().default('1').transform(Number),
            limit: z.string().default('50').transform(Number),
            find: z
              .string()
              .optional()
              .describe('Search by candidate name or email'),
            status: z
              .string()
              .default('all')
              .describe('Filter by candidate status (all, Pending, Approved, Rejected, Selected, or custom column id)'),
            orderBy: z
              .enum(['date', 'score', 'name'])
              .default('date')
              .describe('Order by field'),
            /*
             * Quem ainda não terminou entra ou não.
             *
             * O padrão é `finished` — o contrato que a v1 sempre teve. Eu havia
             * removido o filtro direto, e a v1 usa ESTA MESMA rota: candidatos
             * sem entrevista passaram a aparecer lá, onde a tela oferece
             * "Desbloquear entrevista — consome 1 crédito". Gastar crédito para
             * abrir uma entrevista que não existe é o pior tipo de regressão.
             *
             * O quadro do ATS pede `all` explicitamente, porque a coluna
             * "Candidatura" existe justamente para quem ainda não respondeu.
             */
            finished: z
              .enum(['true', 'all'])
              .default('true')
              .describe('true = only finished interviews (v1 behaviour); all = everyone in the process'),
            orderDirection: z
              .enum(['asc', 'desc'])
              .default('desc')
              .describe('Order direction'),
          }),
          response: {
            200: z.object({
              job: z.object({
                id: z.string(),
                jobName: z.string(),
                identifier: z.string().optional(),
              }),
              candidates: z.array(jobCandidateSchema),
              pagination: z.object({
                total: z.number(),
                page: z.number(),
                totalPages: z.number(),
                hasMore: z.boolean(),
              }),
            }),
            404: z.object({
              message: z.string(),
            }),
          },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (request, reply) => {
        const { company } = await request.getUserMembership()

        const { jobId } = request.params
        const { page, limit, find, status, orderBy, orderDirection, finished } =
          request.query
        const companyId = company.id

        // Verificar se o job existe e pertence à empresa
        const job = await jobsSvc.getJob(companyId, jobId) as PostJob | null

        if (!job) {
          throw new BadRequestError('Job not found')
        }

        /*
         * O quadro mostra QUEM ESTÁ NO PROCESSO, não quem terminou.
         *
         * A consulta filtrava `finished == true` — herança da v1, onde não
         * existia candidatura sem entrevista. Com o apply, isso passou a
         * esconder justamente quem acabou de se candidatar: a coluna
         * "Candidatura" nunca recebia ninguém e o recrutador via a pessoa
         * sumir depois de aplicar.
         *
         * Quem está no meio da entrevista também aparece — é informação, não
         * ruído: candidato travado na etapa é exatamente o que o pipeline
         * existe para mostrar. A etapa quem decide é `candidate_status`.
         *
         * O campo `finished` segue no item da resposta, então a tela consegue
         * distinguir "entrevista concluída" de "em andamento" sem precisar de
         * duas consultas.
         */
        const interviews = (await jobsSvc.listJobInterviews(
          companyId,
          jobId,
          finished === 'all'
            ? {}
            : { filters: [{ field: 'finished', operator: '==', value: true }] },
        )) as Interview[]

        // Filtrar por status se não for 'all' (em memória)
        const jobInterviews =
          status !== 'all'
            ? interviews.filter(
                (interview) =>
                  (interview.candidate_status ?? (interview as { candidateStatus?: string | null }).candidateStatus) === status
              )
            : interviews

        // Aplicar filtro de busca se fornecido
        const filteredInterviews = find
          ? jobInterviews.filter((interview) => {
              const searchTerm = find.toLowerCase()
              return (
                interview.name?.toLowerCase().includes(searchTerm) ||
                interview.email?.toLowerCase().includes(searchTerm)
              )
            })
          : jobInterviews

        // Aplicar ordenação em memória como fallback para garantir que funcione
        if (orderBy === 'score') {
          filteredInterviews.sort((a, b) => {
            const scoreA =
              typeof a.score === 'string'
                ? Number.parseFloat(a.score)
                : a.score || 0
            const scoreB =
              typeof b.score === 'string'
                ? Number.parseFloat(b.score)
                : b.score || 0
            return orderDirection === 'desc' ? scoreB - scoreA : scoreA - scoreB
          })
        } else if (orderBy === 'name') {
          filteredInterviews.sort((a, b) => {
            const nameA = a.name?.toLowerCase() || ''
            const nameB = b.name?.toLowerCase() || ''
            return orderDirection === 'desc'
              ? nameB.localeCompare(nameA)
              : nameA.localeCompare(nameB)
          })
        } else if (orderBy === 'date') {
          filteredInterviews.sort((a, b) => {
            const dateA = toDate(a.date)?.getTime() || 0
            const dateB = toDate(b.date)?.getTime() || 0
            return orderDirection === 'desc' ? dateB - dateA : dateA - dateB
          })
        }

        // Processar candidatos com busca de batchProcessing do jobApplied
        const processedCandidates = await Promise.all(
          filteredInterviews.map(async (interview) => {
            // Extrair IDs das referências
            const jobAppliedId = interview.job_applied_ref?.id
            const userRef = interview.user_ref?.id

            // Buscar batchProcessing e authenticityScore do jobApplied
            let batchProcessing = null
            let authenticityScore = null
            if (jobAppliedId && userRef) {
              const jobApplied = await jobsSvc.getJobApplied(
                userRef,
                jobAppliedId
              ) as JobApplied | null
              if (jobApplied?.batchProcessing) {
                batchProcessing = {
                  status: jobApplied.batchProcessing.status,
                  engineBatchId: jobApplied.batchProcessing.engineBatchId,
                  queuedAt: jobApplied.batchProcessing.queuedAt,
                  completedAt: jobApplied.batchProcessing.completedAt,
                  error: jobApplied.batchProcessing.error,
                }
              }
              // Extrair authenticityScore do cheat detection
              const cheat = (jobApplied?.interview as Record<string, unknown> | undefined)?.cheat as Record<string, unknown> | undefined
              const resumoExecutivo = cheat?.resumo_executivo as Record<string, unknown> | undefined
              if (resumoExecutivo?.pontuacao_autenticidade != null) {
                authenticityScore = resumoExecutivo.pontuacao_autenticidade as number
              }
            }

            return {
              ...interview,
              date: toDate(interview.date),
              date_select: toDate(interview.date_select),
              /*
               * GCP entrega o doc cru do mirror (`candidate_status`, convenção
               * v1); o adapter selfhosted entrega o shape do domain
               * (`candidateStatus`). Sem o fallback, no selfhosted o campo
               * evaporava e TODO candidato caía na coluna default do board
               * ("Entrevista IA") — visto com o primeiro apply da distribuição
               * open.
               */
              candidateStatus:
                interview.candidate_status ??
                (interview as { candidateStatus?: string | null }).candidateStatus,
              // Adicionar campos úteis
              job_applied_ref: jobAppliedId,
              user_ref: userRef,
              job_ref: interview.job_ref?.id,
              batchProcessing,
              authenticityScore,
              /*
               * Quantas perguntas já foram respondidas.
               *
               * Sem isto o quadro não distingue quem NUNCA abriu o link de quem
               * travou na terceira pergunta — os dois apareciam como "entrevista
               * pendente", e a ação certa é diferente em cada caso (convidar de
               * novo vs. lembrar de terminar).
               */
              answeredCount: Array.isArray((interview as { info?: unknown[] }).info)
                ? ((interview as { info?: unknown[] }).info as unknown[]).length
                : 0,
            }
          })
        )

        // Mascarar score para empresas SaaS não-enterprise sem crédito
        // (reaproveita helper compartilhado com listInterviews — mesma regra).
        // Sort por score acontece acima nos valores reais; o mask zera só o
        // campo visível, preservando a ordem original.
        const companyPlan =
          (company as { subscriptionPlan?: string | null }).subscriptionPlan
        const companyPlanDetail = (
          company as { subscriptionDetails?: { plan?: string | null } | null }
        ).subscriptionDetails?.plan
        const isEnterpriseCompany =
          companyPlan === COMPANY_PLANS.enterprise ||
          companyPlanDetail === COMPANY_PLANS.enterprise

        const maskedCandidates = isEnterpriseCompany
          ? processedCandidates
          : await interviewsSvc.applyListingScoreMask(
              companyId,
              processedCandidates as unknown as Record<string, unknown>[],
            )

        /*
         * Identidade viva sobre o espelho.
         *
         * O card do pipeline vinha direto de `companyInterviews`, que congela
         * nome, cargo e foto no momento da entrevista — por isso a mesma pessoa
         * aparecia sem avatar aqui e com avatar em outra tela.
         */
        const withIdentity = await interviewsSvc.enrichIdentities(
          maskedCandidates as unknown as Record<string, unknown>[],
        )

        // Calcular paginação
        const total = withIdentity.length
        const totalPages = Math.ceil(total / limit)
        const startIndex = (page - 1) * limit
        const paginatedCandidates = withIdentity.slice(
          startIndex,
          startIndex + limit
        )

        return reply.send({
          job: {
            id: job.id,
            jobName: job.jobName ?? '',
            identifier: job.identifier ?? undefined,
          },
          candidates: paginatedCandidates as unknown as z.infer<typeof jobCandidateSchema>[],
          pagination: {
            total,
            page,
            totalPages,
            hasMore: page < totalPages,
          },
        })
      }
    )
}
