import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { authService } from '@/lib/init'
import { BadRequestError } from '@coploy/shared/errors'

export function checkEmailExists(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().get(
		'/auth/check-email',
		{
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
