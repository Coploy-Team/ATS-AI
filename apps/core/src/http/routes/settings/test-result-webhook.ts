import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createResultWebhookService } from '@/lib/services/result-webhook-service'
import { TestResultWebhookBodySchema } from '@/schemas/result-webhook-schema'

export function testResultWebhook(app: FastifyInstance) {
	const service = createResultWebhookService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/settings/integrations/webhooks/test',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Test a result webhook endpoint',
					body: TestResultWebhookBodySchema,
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
				// sem isto qualquer um dispara requisição pra URL arbitrária a partir
				// do nosso IP (SSRF de graça)
				await request.getUserMembership()
				const result = await service.testWebhook(request.body)
				return reply.send(result)
			},
		)
}
