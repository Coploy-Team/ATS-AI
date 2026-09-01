import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createRejectionReviewService } from '@/lib/services/rejection-review-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

const candidateReviewResponseSchema = z.object({
	id: z.string(),
	companyId: z.string(),
	jobId: z.string(),
	jobAppliedId: z.string(),
	candidateUserId: z.string(),
	status: z.enum(['pending', 'upheld', 'overturned']),
	requestedAt: z.date(),
	candidateMessage: z.string().nullable().optional(),
	reviewedAt: z.date().nullable().optional(),
	outcomeMessage: z.string().nullable().optional(),
})

export function rejectionReviewCandidateRoutes(app: FastifyInstance) {
	const service = createRejectionReviewService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/careers/:companyId/jobs/:jobId/applications/:jobAppliedId/rejection-review-requests',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['careers'],
					security: [{ bearerAuth: [] }],
					summary: 'Get candidate rejection review request',
					params: z.object({
						companyId: z.string().min(1),
						jobId: z.string().min(1),
						jobAppliedId: z.string().min(1),
					}),
					response: {
						200: candidateReviewResponseSchema.nullable(),
					},
				},
			},
			async (request, reply) => {
				const candidateUserId = await request.getCurrentUser()
				const result = await service.getCandidateReview({
					companyId: request.params.companyId,
					jobId: request.params.jobId,
					jobAppliedId: request.params.jobAppliedId,
					candidateUserId,
				})

				return reply.status(200).send(result)
			},
		)
		.post(
			'/careers/:companyId/jobs/:jobId/applications/:jobAppliedId/rejection-review-requests',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['careers'],
					security: [{ bearerAuth: [] }],
					summary: 'Request human review for an automated rejection',
					params: z.object({
						companyId: z.string().min(1),
						jobId: z.string().min(1),
						jobAppliedId: z.string().min(1),
					}),
					body: z.object({
						candidateMessage: z.string().max(2000).optional(),
					}).default({}),
					response: {
						200: candidateReviewResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const candidateUserId = await request.getCurrentUser()
				const result = await service.requestReview({
					companyId: request.params.companyId,
					jobId: request.params.jobId,
					jobAppliedId: request.params.jobAppliedId,
					candidateUserId,
					candidateMessage: request.body.candidateMessage,
				})

				return reply.status(200).send(result)
			},
		)
}
