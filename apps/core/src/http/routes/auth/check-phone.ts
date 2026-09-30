import type { FastifyInstance } from 'fastify'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { firebaseAdminAuth } from '@/lib/init'
import { BadRequestError } from '@coploy/shared/errors'

export function checkPhoneExists(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().get(
		'/auth/check-phone',
		{
			// Responde se a conta existe — é o que a tela de cadastro precisa saber, e
			// também o que permite varrer quem é cliente. Sem gate (a pessoa ainda não
			// tem conta), então o limite de tentativas é a barreira: enumerar em massa
			// deixa de ser barato sem atrapalhar quem preenche um formulário.
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				'x-surface': 'publico',
				tags: ['auth-candidate'],
				summary: 'Check if phone number exists in Firebase Authentication',
				querystring: z.object({
					phoneNumber: z.string().min(10),
				}),
				response: {
					200: z.object({
						exists: z.boolean(),
					}),
				},
			},
		},
		async (request) => {
			const { phoneNumber } = request.query

			try {
				await firebaseAdminAuth.getUserByPhoneNumber(phoneNumber)
				return { exists: true }
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes('user-not-found')
				) {
					return { exists: false }
				}
				throw new BadRequestError('Error checking phone number')
			}
		},
	)
}
