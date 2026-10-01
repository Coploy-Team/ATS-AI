import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createResultWebhookService } from '@/lib/services/result-webhook-service'

export function deleteResultWebhook(app: FastifyInstance) {
	const service = createResultWebhookService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.delete(
			'/settings/integrations/webhooks/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Delete a result webhook',
					params: z.object({ id: z.string() }),
					response: {
						200: z.object({ message: z.string() }),
						404: z.object({ message: z.string() }),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const { id } = request.params
				const existing = await service.getWebhook(company.id, id)
				if (!existing) {
					return reply.status(404).send({ message: 'Webhook não encontrado' })
				}
				await service.deleteWebhook(company.id, id)
				return reply.send({ message: 'Webhook removido com sucesso' })
			},
		)
}
