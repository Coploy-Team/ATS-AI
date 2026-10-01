import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createResultWebhookService } from '@/lib/services/result-webhook-service'
import {
	UpdateResultWebhookBodySchema,
	ResultWebhookSchema,
} from '@/schemas/result-webhook-schema'

export function updateResultWebhook(app: FastifyInstance) {
	const service = createResultWebhookService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.put(
			'/settings/integrations/webhooks/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Update a result webhook',
					params: z.object({ id: z.string() }),
					body: UpdateResultWebhookBodySchema,
					response: {
						200: z.object({ webhook: ResultWebhookSchema }),
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
				await service.updateWebhook(company.id, id, request.body)
				const updated = await service.getWebhook(company.id, id)
				return reply.send({ webhook: updated } as any)
			},
		)
}
