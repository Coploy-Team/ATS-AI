import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import z from 'zod'
import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { BadRequestError } from '@coploy/shared/errors'

export function refreshToken(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().post(
		'/sessions/refresh',
		{
			config: {
				rateLimit: rateLimitConfigs.auth,
			},
			schema: {
				'x-surface': 'publico',
				tags: ['auth'],
				summary: 'Refresh authentication token',
				body: z.object({
					refreshToken: z.string(),
				}),
				response: {
					200: z.object({
						token: z.string(),
						refreshToken: z.string(),
						expiresIn: z.string(),
						tokenType: z.string(),
					}),
					400: z.object({
						message: z.string(),
					}),
				},
			},
		},
		async (request, reply) => {
			const { refreshToken } = request.body

			try {
				// Usar Firebase Auth REST API para refresh token
				const firebaseRefreshUrl = `https://securetoken.googleapis.com/v1/token?key=${env.FIREBASE_API_KEY}`

				const refreshResponse = await fetch(firebaseRefreshUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						grant_type: 'refresh_token',
						refresh_token: refreshToken,
					}),
				})

				if (!refreshResponse.ok) {
					const errorData = await refreshResponse.text()
					throw new BadRequestError(
						`Token de refresh inválido ou expirado: ${errorData}`,
					)
				}

				const refreshData = await refreshResponse.json() as { id_token?: string; refresh_token?: string; expires_in?: string }

				return reply.status(200).send({
					token: refreshData.id_token ?? '',
					refreshToken: refreshData.refresh_token ?? '',
					expiresIn: refreshData.expires_in ?? '',
					tokenType: 'Bearer',
				})
			} catch (error) {
				if (error instanceof BadRequestError) {
					throw error
				}
				throw new BadRequestError('Erro interno ao processar refresh do token')
			}
		},
	)
}
