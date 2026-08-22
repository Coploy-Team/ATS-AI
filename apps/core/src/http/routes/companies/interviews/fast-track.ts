import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'

export function fastTrack(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/interviews/:userId/:jobAppliedId/fast-track',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Fast-track interview processing (skip batch queue)',
					params: z.object({
						userId: z.string(),
						jobAppliedId: z.string(),
					}),
					response: {
						200: z.object({
							success: z.boolean(),
							message: z.string(),
							jobAppliedId: z.string(),
							processingMode: z.literal('fast_track'),
							creditUsed: z.boolean(),
							creditId: z.string().optional(),
						}),
						400: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const { userId: candidateUserId, jobAppliedId } = request.params
				const membership = await request.getUserMembership()
				const authenticatedUserId = await request.getCurrentUser()
				const accessToken = await request.getAccessToken()

				const result = await interviewsService.fastTrackInterview({
					candidateUserId,
					jobAppliedId,
					companyId: membership.company.id,
					authenticatedUserId,
					accessToken,
					requestId: request.id,
					ip: request.ip ?? null,
					userAgent: request.headers['user-agent'] ?? null,
				})

				return reply.status(200).send(result)
			},
		)
}
