import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createCandidatesRankingService } from '@/lib/services/candidates-ranking-service'
import {
	candidatesRankingQuerySchema,
	candidatesRankingResponseSchema,
} from '@/schemas/candidates-ranking-schema'
import { COMPANY_PLANS } from '@/http/constants/company-free-constants'
import type { Company } from '@coploy/domain'
import type { z } from 'zod'

export function getCandidatesRanking(app: FastifyInstance) {
	const { fetchCandidatesInBatches, enrichCandidatesWithJobs } = createCandidatesRankingService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/candidates/ranking',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary:
						'Get candidates ranking by average score (optimized with batch processing)',
					description:
						'Get candidates ranking with real pagination - processes data in batches for better performance. Does not cache as data changes in real-time.',
					querystring: candidatesRankingQuerySchema,
					response: {
						200: candidatesRankingResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const {
					page,
					limit,
					find,
					status,
					dataRange,
					score,
					interviewCount,
					cursor,
					jobId,
				} = request.query
				const user = await request.getUserMembership()

				// Empresas enterprise (ou em plano enterprise via subscriptionDetails)
				// não sofrem mask. Para demais, mask de score é aplicado pelo service.
				const companyDoc = (await app.infra.companyRepository.getCompany(
					user.company.id,
				)) as Company | null
				const isEnterpriseCompany =
					companyDoc?.subscriptionPlan === COMPANY_PLANS.enterprise ||
					(companyDoc?.subscriptionDetails as { plan?: string } | null | undefined)?.plan ===
						COMPANY_PLANS.enterprise

				// Buscar candidatos de forma otimizada em lotes
				const { candidates, nextCursor, maskContext } = await fetchCandidatesInBatches(
					user.company.id,
					page,
					limit,
					{
						status,
						dataRange,
						interviewCount,
						score,
						find,
						cursor,
						jobId,
					},
					isEnterpriseCompany,
				)

				type ResponseType = z.infer<typeof candidatesRankingResponseSchema>
				const mapCandidate = (candidate: typeof candidates[number]) => {
					const avg = candidate.averageScore
					const roundedAvg =
						avg === null || !Number.isFinite(avg)
							? null
							: Number(avg.toFixed(2))
					return {
						...candidate,
						averageScore: roundedAvg,
						lastInterview: candidate.lastInterview?.toISOString() || null,
						created_time: candidate.created_time?.toISOString() || null,
					}
				}

				// Se tem filtro de texto, usar cursor pagination (retornado pelo service)
				if (find && find.length >= 3) {
					const hasMore = candidates.length > limit
					const candidatesToReturn = hasMore
						? candidates.slice(0, limit)
						: candidates

					const candidatesWithJobs = await enrichCandidatesWithJobs(
						candidatesToReturn,
						user.company.id,
						maskContext ?? null,
					)

					const estimatedTotal = hasMore
						? page * limit + limit
						: (page - 1) * limit + candidatesToReturn.length

					return reply.send({
						candidates: candidatesWithJobs.map(mapCandidate),
						pagination: {
							total: estimatedTotal,
							page,
							totalPages: hasMore ? page + 1 : page,
							hasMore,
						},
						nextCursor,
					} as unknown as ResponseType)
				}

				// Sem filtro de texto: paginação em memória (ordenado por score)
				const totalCandidates = candidates.length
				const startIndex = (page - 1) * limit
				const endIndex = startIndex + limit
				const paginatedCandidates = candidates.slice(startIndex, endIndex)

				// Buscar jobsApplied apenas para os candidatos da página atual
				const candidatesWithJobs = await enrichCandidatesWithJobs(
					paginatedCandidates,
					user.company.id,
					maskContext ?? null,
				)

				const totalPages = Math.ceil(totalCandidates / limit)
				const hasMore = page < totalPages

				return reply.send({
					candidates: candidatesWithJobs.map(mapCandidate),
					pagination: {
						total: totalCandidates,
						page,
						totalPages,
						hasMore,
					},
					nextCursor: null, // Sem cursor para paginação por score
				} as unknown as ResponseType)
			},
		)
}
