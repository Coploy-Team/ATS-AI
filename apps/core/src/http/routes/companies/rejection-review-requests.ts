import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createRejectionReviewService } from '@/lib/services/rejection-review-service'

const reviewRequestSchema = z.object({
	id: z.string(),
	companyId: z.string(),
	jobId: z.string(),
	jobAppliedId: z.string(),
	candidateUserId: z.string(),
	status: z.enum(['pending', 'upheld', 'overturned']),
	requestedAt: z.date(),
	candidateMessage: z.string().nullable().optional(),
	reviewedByUserId: z.string().nullable().optional(),
	reviewedAt: z.date().nullable().optional(),
	reviewerNote: z.string().nullable().optional(),
	outcomeMessage: z.string().nullable().optional(),
})

export function rejectionReviewRecruiterRoutes(app: FastifyInstance) {
	const service = createRejectionReviewService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/rejection-review-requests/pending',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'List pending automated rejection review requests',
					querystring: z.object({
						limit: z.coerce.number().int().min(1).max(200).optional(),
					}),
					response: {
						200: z.object({
							requests: z.array(reviewRequestSchema),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const requests = await service.listPending({
					companyId: company.id,
					limit: request.query.limit,
				})
				return { requests }
			},
		)
		.patch(
			'/companies/rejection-review-requests/:requestId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Resolve an automated rejection review request',
					params: z.object({
						requestId: z.string().min(1),
					}),
					body: z.object({
						status: z.enum(['upheld', 'overturned']),
						reviewerNote: z.string().max(5000).optional(),
						outcomeMessage: z.string().max(2000).optional(),
					}),
					response: {
						200: reviewRequestSchema,
					},
				},
			},
			async (request) => {
				const reviewedByUserId = await request.getCurrentUser()
				const { company } = await request.getUserMembership()
				return service.respond({
					companyId: company.id,
					requestId: request.params.requestId,
					status: request.body.status,
					reviewedByUserId,
					reviewerNote: request.body.reviewerNote,
					outcomeMessage: request.body.outcomeMessage,
				})
			},
		)
}
