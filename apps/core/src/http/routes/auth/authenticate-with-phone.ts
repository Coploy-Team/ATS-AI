import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import z from 'zod'
import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { firebaseAdminAuth } from '@/lib/init'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuthService } from '@/lib/services/auth-service'

export function authenticateWithPhone(app: FastifyInstance) {
	const authService = createAuthService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().post(
		'/sessions/phone',
		{
			config: {
				rateLimit: rateLimitConfigs.auth,
			},
			schema: {
				'x-surface': 'publico',
				tags: ['auth'],
				summary: 'Authenticate with phone number',
				body: z.object({
					phone_number: z
						.string()
						.min(10, 'Número de telefone deve ter pelo menos 10 dígitos'),
				}),
				response: {
					201: z.object({
						token: z.string(),
						refreshToken: z.string(),
						expiresIn: z.string(),
						user: z.object({
							uid: z.string(),
							name: z.string(),
							email: z.string(),
							phone_number: z.string(),
						}),
					}),
					400: z.object({
						message: z.string(),
					}),
				},
			},
		},
		async (request, reply) => {
			const { phone_number } = request.body

		// Buscar usuário pelo phone_number
		const foundUser = await authService.findUserByPhone(phone_number)
		const users = foundUser ? [foundUser] : []

			if (users.length === 0) {
				throw new BadRequestError(
					'Usuário não encontrado com este número de telefone',
				)
			}

			const user = users[0]

			try {
				// Claims customizados para o custom token
				const additionalClaims = {
					name:
						user.display_name || `${user.first_name} ${user.last_name}`.trim(),
					email: user.email,
					phone_number: user.phone_number,
					first_name: user.first_name,
					last_name: user.last_name,
					occupation: user.occupation,
					is_owner: user.is_owner,
					photo_url: user.photo_url,
					premiumAccount: true,
				}

				// 1. Criar custom token
				const customToken = await firebaseAdminAuth.createCustomToken(
					user.id,
					additionalClaims,
				)

				// 2. Trocar custom token por ID token usando Firebase Auth REST API
				const firebaseAuthUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.FIREBASE_API_KEY}`

				const authResponse = await fetch(firebaseAuthUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						token: customToken,
						returnSecureToken: true,
					}),
				})

				if (!authResponse.ok) {
					const errorData = await authResponse.text()
					throw new BadRequestError(`Erro na troca do token: ${errorData}`)
				}

				const authData = await authResponse.json() as { idToken?: string; refreshToken?: string; expiresIn?: string }
				const idToken = authData.idToken

				return reply.status(201).send({
					token: idToken ?? '',
					refreshToken: authData.refreshToken ?? '',
					expiresIn: authData.expiresIn ?? '',
					user: {
						uid: user.id,
						name:
							user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim(),
						email: user.email ?? "",
						phone_number: user.phone_number ?? "",
					},
				})
			} catch (error) {
				throw new BadRequestError(
					`Erro interno ao processar autenticação: ${error as string}`,
				)
			}
		},
	)
}
