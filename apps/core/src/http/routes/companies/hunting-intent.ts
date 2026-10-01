import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { Company } from '@coploy/domain'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createHuntingIntentService } from '@/lib/services/hunting-intent-service'

/**
 * "Preciso de alguém de suporte pleno que já lidou com cliente irritado" vira
 * filtro de busca.
 *
 * A rota não busca: ela traduz. Quem busca continua sendo
 * `GET /public_interviews`, com os mesmos filtros de sempre — o que muda é que
 * agora dá para alcançá-los sem conhecer o nome de cada parâmetro.
 */
export function huntingIntent(app: FastifyInstance) {
	const service = createHuntingIntentService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/hunting/intent',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['hunting'],
					security: [{ bearerAuth: [] }],
					summary: 'Turn a plain-language request into talent search filters',
					description:
						'Devolve os filtros interpretados para a tela aplicar e MOSTRAR — o resultado ' +
						'é editável, não uma caixa-preta. Sempre devolve critério: `refine` é uma ' +
						'sugestão de refinamento e nunca impede a busca.',
					body: z.object({ text: z.string().min(3).max(600) }),
					response: {
						200: z.object({
							criteria: z.record(z.string(), z.union([z.string(), z.number()])),
							refine: z.string().nullable(),
							summary: z.string(),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const userId = await request.getCurrentUser().catch(() => null)
				return service.interpret({
					company: company as Company & { id: string },
					userId,
					text: request.body.text,
				})
			},
		)
}
