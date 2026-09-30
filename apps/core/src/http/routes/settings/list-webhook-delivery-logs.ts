import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createResultWebhookService } from '@/lib/services/result-webhook-service'

const WebhookDeliveryLogSchema = z.object({
	id: z.string(),
	webhookId: z.string(),
	companyId: z.string().nullable().optional(),
	event: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	method: z.string().nullable().optional(),
	requestHeaders: z.any().nullable().optional(),
	requestBody: z.any().nullable().optional(),
	statusCode: z.number().nullable().optional(),
	responseBody: z.string().nullable().optional(),
	success: z.boolean(),
	errorMessage: z.string().nullable().optional(),
	durationMs: z.number().nullable().optional(),
	createdAt: z.any().nullable().optional(),
})

export function listWebhookDeliveryLogs(app: FastifyInstance) {
	const service = createResultWebhookService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/settings/integrations/webhooks/logs',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'List webhook delivery logs for the company',
					querystring: z.object({
						limit: z.coerce.number().min(1).max(100).optional().default(20),
					}),
					response: {
						200: z.object({
							logs: z.array(WebhookDeliveryLogSchema),
						}),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const { limit } = request.query
				const logs = await service.listDeliveryLogs(company.id, limit)
				return reply.send({ logs } as any)
			},
		)
}
