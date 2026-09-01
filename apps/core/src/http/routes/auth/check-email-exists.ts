import type { FastifyInstance } from 'fastify'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { authService } from '@/lib/init'
import { BadRequestError } from '@coploy/shared/errors'

export function checkEmailExists(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().get(
		'/auth/check-email',
		{
			// Responde se a conta existe — é o que a tela de cadastro precisa saber, e
			// também o que permite varrer quem é cliente. Sem gate (a pessoa ainda não
			// tem conta), então o limite de tentativas é a barreira: enumerar em massa
			// deixa de ser barato sem atrapalhar quem preenche um formulário.
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				'x-surface': 'publico',
				tags: ['auth'],
				summary: 'Check if email exists in authentication system',
				querystring: z.object({
					email: z.string().email('Email inválido'),
				}),
				response: {
					200: z.object({
						exists: z.boolean(),
						message: z.string(),
					}),
				},
			},
		},
		async (request) => {
			const { email } = request.query

			try {
				const userRecord = await authService.getUserByEmail(email)

				if (!userRecord) {
					return {
						exists: false,
						message: 'Email não encontrado no sistema',
					}
				}

				return {
					exists: true,
					message: 'Email encontrado no sistema',
				}
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes('user-not-found')
				) {
					return {
						exists: false,
						message: 'Email não encontrado no sistema',
					}
				}

				throw new BadRequestError('Erro ao verificar email')
			}
		},
	)
}
