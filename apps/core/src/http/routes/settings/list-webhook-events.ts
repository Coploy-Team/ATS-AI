import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { eventCatalog } from '@/lib/events/event-catalog'
import { createAuth } from '@/http/routes/middlewares/auth'

/**
 * Catálogo de eventos assináveis (V2-504).
 *
 * O dado já era emitido: o outbox tem 11 tipos versionados e drenados por
 * scheduler. O que faltava era o cliente PODER assinar — o webhook só conhecia
 * `interview.finished`, então quem queria sincronizar o próprio funil recebia
 * apenas o resultado da nossa entrevista.
 *
 * A lista sai do catálogo, não de constante paralela: evento novo aparece aqui
 * sozinho, sem alguém lembrar de atualizar a documentação.
 */
export function listWebhookEvents(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/settings/integrations/webhooks/events',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'List subscribable webhook event types',
					response: {
						200: z.object({
							events: z.array(
								z.object({
									type: z.string(),
									/** Campos que o payload garante — o resto passa adiante. */
									fields: z.array(z.string()),
								}),
							),
							/** Evento legado, sempre entregue quando nada é assinado. */
							legacy: z.string(),
						}),
					},
				},
			},
			async (request) => {
				/*
				 * O catálogo é a mesma lista para todo mundo, mas a chamada precisa
				 * autenticar: `createAuth` é lazy — registrar o middleware não
				 * protege nada, quem protege é pedir a associação aqui.
				 */
				await request.getUserMembership()
				const events = Object.entries(eventCatalog).map(([type, schema]) => ({
					type,
					fields: Object.keys((schema as unknown as { shape: object }).shape ?? {}),
				}))
				return { events, legacy: 'interview.finished' }
			},
		)
}
