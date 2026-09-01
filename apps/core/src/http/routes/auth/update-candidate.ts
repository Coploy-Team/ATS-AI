import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuthService } from '@/lib/services/auth-service'
import { createCandidateProfileService } from '@/lib/services/candidate-profile-service'

export function updateCandidatePhoto(app: FastifyInstance) {
	const authService = createAuthService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().post(
		'/auth/update-photo',
		{
			schema: {
				'x-surface': 'candidato',
				tags: ['auth-candidate'],
				summary: 'Update candidate photo URL',
				security: [{ bearerAuth: [] }],
				body: z.object({ photoUrl: z.string().url() }),
				response: {
					200: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			const userId = await verifyAndGetUserId(request, authService)

			await authService.updateUser(userId, { photo_url: request.body.photoUrl })

			return { message: 'Photo updated successfully' }
		},
	)
}

export function updateCandidateResume(app: FastifyInstance) {
	const authService = createAuthService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().post(
		'/auth/update-resume',
		{
			schema: {
				'x-surface': 'candidato',
				tags: ['auth-candidate'],
				summary: 'Update candidate resume URL',
				security: [{ bearerAuth: [] }],
				body: z.object({ resumeUrl: z.string().url() }),
				response: {
					200: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			const userId = await verifyAndGetUserId(request, authService)

			await authService.updateUser(userId, { resumeUrl: request.body.resumeUrl })

			return { message: 'Resume updated successfully' }
		},
	)
}

export function updateCandidateProfile(app: FastifyInstance) {
	const authService = createAuthService(app.infra)
	const profileService = createCandidateProfileService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().post(
		'/auth/update-profile',
		{
			schema: {
				'x-surface': 'candidato',
				tags: ['auth-candidate'],
				summary: 'Update candidate profile fields',
				description:
					'Escreve no currículo vivo (merge parcial). Aceita as chaves em camelCase e ' +
					'também em PascalCase, formato que a área do candidato herdou da API antiga.',
				security: [{ bearerAuth: [] }],
				// `passthrough` + normalização: o cliente legado manda PascalCase e um
				// campo `IV3`. Antes o Zod fazia strip disso e a rota respondia 200
				// sem gravar NADA — o candidato salvava e perdia.
				body: z
					.object({
						name: z.string().optional(),
						occupation: z.string().optional(),
						level: z.string().optional(),
						professionalObjectives: z.string().optional(),
						phoneNumber: z.string().optional(),
						photoUrl: z.string().optional(),
						resumeUrl: z.string().optional(),
						countryOfResidence: z.string().optional(),
						countriesOfInterest: z.array(z.string()).optional(),
					})
					.passthrough(),
				response: {
					200: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			const userId = await verifyAndGetUserId(request, authService)
			const body = request.body as Record<string, unknown>

			/** Aceita `name` e `Name`; devolve o primeiro que vier preenchido. */
			const pick = <T>(key: string): T | undefined => {
				const pascal = key.charAt(0).toUpperCase() + key.slice(1)
				return (body[key] ?? body[pascal]) as T | undefined
			}

			// Identidade continua em users/{uid} — é lida pela plataforma inteira
			const identity: Record<string, unknown> = {}
			const name = pick<string>('name')
			const phoneNumber = pick<string>('phoneNumber')
			const photoUrl = pick<string>('photoUrl')
			if (name) identity.display_name = name
			if (phoneNumber) identity.phone_number = phoneNumber
			if (photoUrl) identity.photo_url = photoUrl
			if (Object.keys(identity).length > 0) {
				await authService.updateUser(userId, identity)
			}

			// Perfil profissional vai pro currículo vivo
			const profilePatch: Record<string, unknown> = {}
			for (const field of [
				'occupation',
				'level',
				'professionalObjectives',
				'resumeUrl',
				'countryOfResidence',
				'countriesOfInterest',
			]) {
				const value = pick(field)
				if (value !== undefined && value !== null) profilePatch[field] = value
			}
			if (name) profilePatch.name = name
			if (phoneNumber) profilePatch.phone = phoneNumber

			if (Object.keys(profilePatch).length > 0) {
				await profileService.updateProfile(userId, profilePatch, 'dashboard')
			}

			return { message: 'Profile updated successfully' }
		},
	)
}

type AuthServiceType = ReturnType<typeof import('@/lib/services/auth-service').createAuthService>

async function verifyAndGetUserId(
	request: { headers: { authorization?: string } },
	authService: AuthServiceType,
): Promise<string> {
	const authHeader = request.headers.authorization
	if (!authHeader?.startsWith('Bearer ')) {
		throw new BadRequestError('Missing authorization header')
	}

	const token = authHeader.substring(7)
	const decoded = await authService.verifyToken(token)
	return decoded.uid
}
