import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createResultWebhookService } from '@/lib/services/result-webhook-service'

export function retryWebhookDelivery(app: FastifyInstance) {
	const service = createResultWebhookService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/settings/integrations/webhooks/logs/:logId/retry',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Retry a failed webhook delivery',
					params: z.object({
						logId: z.string(),
					}),
					response: {
						200: z.object({
							success: z.boolean(),
							statusCode: z.number().optional(),
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const { logId } = request.params
				const result = await service.retryDelivery(logId, company.id)
				return reply.send(result as any)
			},
		)
}
