import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createHiringManagerReviewService } from '@/lib/services/hm-review-service'

export function createHmReviewToken(app: FastifyInstance) {
	const hmReviewService = createHiringManagerReviewService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/jobs/:jobId/hm-review-tokens',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Issue a hiring-manager review token for a job shortlist',
					params: z.object({
						jobId: z.string().min(1),
					}),
					body: z.object({
						jobAppliedIds: z.array(z.string().min(1)).min(1).max(50),
					}),
					response: {
						201: z.object({
							code: z.string(),
							expiresAt: z.string(),
							url: z.string().url(),
						}),
					},
				},
			},
			async (request, reply) => {
				const userId = await request.getCurrentUser()
				const { company } = await request.getUserMembership()
				const result = await hmReviewService.issue({
					companyId: company.id,
					jobId: request.params.jobId,
					jobAppliedIds: request.body.jobAppliedIds,
					createdByUserId: userId,
				})
				return reply.status(201).send({
					code: result.code,
					expiresAt: result.expiresAt.toISOString(),
					url: result.url,
				})
			},
		)
}
