import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createInterviewHandoffService } from '@/lib/services/interview-handoff-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

/**
 * Handoff de sessão: deixa o candidato abrir a entrevista já autenticado a
 * partir de um canal externo (plugin ChatGPT/Claude), sem digitar senha.
 *
 * - Emissão: autenticada como o candidato.
 * - Resgate: público por necessidade (o app de entrevista chama antes de ter
 *   sessão), protegido por ticket de alta entropia, TTL curto, uso único
 *   atômico e rate limit.
 */
export function interviewHandoff(app: FastifyInstance) {
	const handoffService = createInterviewHandoffService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post(
			'/dream-jobs/interview/handoff',
			{
				config: { rateLimit: rateLimitConfigs.auth },
				schema: {
					'x-surface': 'candidato',
					tags: ['dream_jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Issue a single-use handoff code for the interview link',
					response: {
						201: z.object({
							code: z.string(),
							expiresAt: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const userId = await request.getCurrentUser()
				const { code, expiresAt } = await handoffService.issue(userId)
				return reply.status(201).send({ code, expiresAt: expiresAt.toISOString() })
			},
		)

	app.withTypeProvider<ZodTypeProvider>().post(
		'/dream-jobs/interview/handoff/exchange',
		{
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				'x-surface': 'publico',
				tags: ['dream_jobs'],
				summary: 'Exchange a handoff code for a session token (single use)',
				description:
					'Public by necessity: called by the interview app before it has a session. ' +
					'The code is high-entropy, short-lived and burned on first use.',
				body: z.object({ code: z.string().min(20) }),
				response: {
					200: z.object({ sessionToken: z.string() }),
					401: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			return handoffService.redeem(request.body.code)
		},
	)
}
