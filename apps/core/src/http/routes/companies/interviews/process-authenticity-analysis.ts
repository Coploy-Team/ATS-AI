import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'

export async function processAuthenticityAnalysis(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/interviews/:userId/:jobAppliedId/authenticity-analysis',
			{
				schema: {
					'x-surface': 'empresa',
					security: [{ bearerAuth: [] }],
					tags: ['interviews'],
					summary:
						'Processar análise de autenticidade humana (consome 1 crédito para não-Enterprise)',
					params: z.object({
						userId: z.string(),
						jobAppliedId: z.string(),
					}),
					response: {
						200: z.object({
							success: z.boolean(),
							message: z.string(),
							creditsRemaining: z
								.object({
									creditsMonthly: z.number(),
									creditsCourtesy: z.number(),
									creditsFixed: z.number(),
									creditsTotal: z.number(),
								})
								.optional(),
						}),
					},
				},
			},
			async (request, reply) => {
				const { userId, jobAppliedId } = request.params
				const { company } = await request.getUserMembership()
				const authenticatedUserId = await request.getCurrentUser()
				const accessToken = await request.getAccessToken()

				const result = await interviewsService.processAuthenticityAnalysis({
					userId,
					jobAppliedId,
					companyId: company.id,
					company,
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
