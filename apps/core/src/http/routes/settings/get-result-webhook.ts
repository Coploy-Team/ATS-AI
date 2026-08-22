import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createResultWebhookService } from '@/lib/services/result-webhook-service'
import { ResultWebhookSchema } from '@/schemas/result-webhook-schema'

export function getResultWebhook(app: FastifyInstance) {
	const service = createResultWebhookService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/settings/integrations/webhooks/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Get a specific result webhook',
					params: z.object({ id: z.string() }),
					response: {
						200: z.object({ webhook: ResultWebhookSchema }),
						404: z.object({ message: z.string() }),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const { id } = request.params
				const webhook = await service.getWebhook(company.id, id)
				if (!webhook) {
					return reply.status(404).send({ message: 'Webhook não encontrado' })
				}
				return reply.send({ webhook } as any)
			},
		)
}
