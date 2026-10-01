import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { getDiceBearAvatarUrl } from '@/http/constants/company-free-constants'
import { firebaseAdminAuth } from '@/lib/init'
import { env } from '@/env'
import { createAuthService } from '@/lib/services/auth-service'

export function createCandidate(app: FastifyInstance) {
	const authService = createAuthService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().post(
		'/auth/create',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['auth-candidate'],
				summary: 'Create candidate user with email and password',
				body: z.object({
					name: z.string().min(2),
					email: z.string().email(),
					password: z.string().min(6),
					phoneNumber: z.string().optional(),
					occupation: z.string().optional(),
					level: z.string().optional(),
					language: z.string().default('pt-BR'),
				}),
				response: {
					201: z.object({
						token: z.string(),
						refreshToken: z.string(),
						uid: z.string(),
					}),
				},
			},
		},
		async (request, reply) => {
			const { name, email, password, phoneNumber, occupation, level, language } = request.body

			const createUserAndGetToken = authService.createUserAndGetToken

			if (typeof createUserAndGetToken === 'function') {
				// Self-hosted (BetterAuth): criar usuário e obter token da sessão
				const result = await createUserAndGetToken({
					email,
					password,
					displayName: name,
					phoneNumber,
				})

				await authService.createUser(
					{
						uuid: result.uid,
						display_name: name,
						email,
						phone_number: phoneNumber ?? '',
						photo_url: getDiceBearAvatarUrl(name || email),
						occupation: occupation ?? '',
						level: level ?? '',
						language,
						created_time: new Date(),
					},
					result.uid,
				)

				return reply.status(201).send({
					token: result.token,
					refreshToken: result.refreshToken ?? result.token,
					uid: result.uid,
				})
			}

			// GCP (Firebase): fluxo com custom token + Identity Toolkit
			const userRecord = await firebaseAdminAuth.createUser({
				email,
				password,
				displayName: name,
				...(phoneNumber ? { phoneNumber } : {}),
			})

			await authService.createUser(
				{
					uuid: userRecord.uid,
					display_name: name,
					email,
					phone_number: phoneNumber ?? '',
					photo_url: getDiceBearAvatarUrl(name || email),
					occupation: occupation ?? '',
					level: level ?? '',
					language,
					created_time: new Date(),
				},
				userRecord.uid,
			)

			const customToken = await firebaseAdminAuth.createCustomToken(userRecord.uid)

			const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.FIREBASE_API_KEY}`
			const authResponse = await fetch(authUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: customToken, returnSecureToken: true }),
			})

			if (!authResponse.ok) {
				throw new BadRequestError('Failed to generate authentication token')
			}

			const authData = await authResponse.json() as { idToken?: string; refreshToken?: string }

			return reply.status(201).send({
				token: authData.idToken ?? '',
				refreshToken: authData.refreshToken ?? '',
				uid: userRecord.uid,
			})
		},
	)
}
