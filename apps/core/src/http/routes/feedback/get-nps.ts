import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { QueryFilter } from '@coploy/domain'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import type { Nps } from '@coploy/domain'
import { createFeedbackService } from '@/lib/services/feedback-service'

const getNpsQuerySchema = z.object({
  page: z.string().default('1').transform(Number),
  limit: z.string().default('10').transform(Number),
  jobId: z.string().optional(),
  candidateId: z.string().optional(),
  interviewType: z
    .enum(['all', 'exitJob', 'evaluation', 'interview', 'emotional'])
    .default('all'),
  minScore: z.string().transform(Number).optional(),
  maxScore: z.string().transform(Number).optional(),
})

export function getNps(app: FastifyInstance) {
  const feedbackService = createFeedbackService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get(
      '/feedback/nps',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['feedback'],
          security: [{ bearerAuth: [] }],
          summary: 'Get NPS feedback with pagination and filters',
          description:
            'Get NPS (Net Promoter Score) feedback entries with pagination and filtering options',
          querystring: getNpsQuerySchema,
          response: {
            200: z.object({
              nps: z.array(
                z.object({
                  id: z.string(),
                  companyId: z.string(),
                  jobId: z.string(),
                  jobName: z.string(),
                  candidateId: z.string(),
                  candidateName: z.string(),
                  candidateEmail: z.string(),
                  score: z.number(),
                  comment: z.string(),
                  interviewType: z.string(),
                  createdAt: z.string(),
                })
              ),
              pagination: z.object({
                total: z.number(),
                page: z.number(),
                totalPages: z.number(),
                hasMore: z.boolean(),
              }),
              statistics: z.object({
                averageScore: z.number(),
                totalResponses: z.number(),
                promoters: z.number(),
                neutrals: z.number(),
                detractors: z.number(),
                npsScore: z.number(),
              }),
            }),
          },
        },
      },
      async (request) => {
        const {
          page,
          limit,
          jobId,
          candidateId,
          interviewType,
          minScore,
          maxScore,
        } = request.query
        const userMembership = await request.getUserMembership()
        const companyId = userMembership.company.id

        try {
          // Construir filtros
          const filters: QueryFilter[] = []

          if (jobId) {
            filters.push({ field: 'jobId', operator: '==', value: jobId })
          }

          if (candidateId) {
            filters.push({ field: 'candidateId', operator: '==', value: candidateId })
          }

          if (interviewType !== 'all') {
            filters.push({ field: 'interviewType', operator: '==', value: interviewType })
          }

          if (minScore !== undefined) {
            filters.push({ field: 'score', operator: '>=', value: minScore })
          }

          if (maxScore !== undefined) {
            filters.push({ field: 'score', operator: '<=', value: maxScore })
          }

          // Buscar todos os NPSs para estatísticas
          const allNps = await feedbackService.listNps(
            companyId,
            { filters, orderByField: 'createdAt', orderDirection: 'desc' }
          ) as Nps[]

          // Calcular estatísticas
          const totalResponses = allNps.length
          const averageScore =
            totalResponses > 0
              ? allNps.reduce((sum, nps) => sum + nps.score, 0) / totalResponses
              : 0

          // NPS com escala 1-5: Promoters (4-5) | Neutrals (3) | Detractors (1-2)
          const promoters = allNps.filter((nps) => nps.score >= 4).length
          const neutrals = allNps.filter((nps) => nps.score === 3).length
          const detractors = allNps.filter((nps) => nps.score <= 2).length

          // Calcular NPS Score (% Promoters - % Detractors)
          const npsScore =
            totalResponses > 0
              ? (promoters / totalResponses) * 100 -
                (detractors / totalResponses) * 100
              : 0

          // Aplicar paginação
          const total = allNps.length
          const totalPages = Math.ceil(total / limit)
          const startIndex = (page - 1) * limit
          const paginatedNps = allNps.slice(startIndex, startIndex + limit)

          // Formatar resposta
          const formattedNps = paginatedNps.map((nps) => ({
            id: nps.id,
            companyId: nps.companyId,
            jobId: nps.jobId,
            jobName: nps.jobName,
            candidateId: nps.candidateId,
            candidateName: nps.candidateName,
            candidateEmail: nps.candidateEmail,
            score: nps.score,
            comment: nps.comment,
            interviewType: nps.interviewType,
            createdAt:
              nps.createdAt instanceof Date
                ? nps.createdAt.toISOString()
                : new Date().toISOString(),
          }))

          return {
            nps: formattedNps,
            pagination: {
              total,
              page,
              totalPages,
              hasMore: page < totalPages,
            },
            statistics: {
              averageScore: Number(averageScore.toFixed(2)),
              totalResponses,
              promoters,
              neutrals,
              detractors,
              npsScore: Number(npsScore.toFixed(1)),
            },
          }
        } catch (error) {
          throw new BadRequestError(error as string)
        }
      }
    )
}
