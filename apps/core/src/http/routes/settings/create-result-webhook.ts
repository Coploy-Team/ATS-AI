import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createResultWebhookService } from '@/lib/services/result-webhook-service'
import {
	CreateResultWebhookBodySchema,
	ResultWebhookSchema,
} from '@/schemas/result-webhook-schema'

export function createResultWebhook(app: FastifyInstance) {
	const service = createResultWebhookService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/settings/integrations/webhooks',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Create a new result webhook',
					body: CreateResultWebhookBodySchema,
					response: {
						201: z.object({ webhook: ResultWebhookSchema }),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const webhook = await service.createWebhook(company.id, request.body)
				return reply.status(201).send({ webhook } as any)
			},
		)
}
