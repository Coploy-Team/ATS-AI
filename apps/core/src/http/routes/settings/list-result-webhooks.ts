import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createResultWebhookService } from '@/lib/services/result-webhook-service'
import { ResultWebhookSchema } from '@/schemas/result-webhook-schema'

export function listResultWebhooks(app: FastifyInstance) {
	const service = createResultWebhookService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/settings/integrations/webhooks',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'List result webhooks for the company',
					response: {
						200: z.object({
							webhooks: z.array(ResultWebhookSchema),
						}),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const webhooks = await service.listWebhooks(company.id)
				return reply.send({ webhooks } as any)
			},
		)
}
