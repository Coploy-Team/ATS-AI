import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import z from 'zod'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { BadRequestError } from '@coploy/shared/errors'
import { authService } from '@/lib/init'

export function authenticateWithPassword(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().post(
		'/sessions/password',
		{
			config: {
				rateLimit: rateLimitConfigs.auth,
			},
			schema: {
				'x-surface': 'publico',
				tags: ['auth'],
				summary: 'Authenticate with email and password',
				body: z.object({
					email: z.string().email(),
					password: z.string().min(6),
				}),
				response: {
					201: z.object({
						token: z.string(),
					}),
				},
			},
		},
		async (request, reply) => {
			const { email, password } = request.body

			try {
				const token = await authService.signInWithPassword(email, password)
				return reply.status(201).send({ token })
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				if (message.includes('inválid') || message.includes('INVALID') || message.includes('NOT_FOUND')) {
					throw new BadRequestError('Credenciais inválidas')
				}
				throw error
			}
		},
	)
}
