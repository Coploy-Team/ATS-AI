import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { createCandidateProfileService } from '@/lib/services/candidate-profile-service'
import {
	candidateProfileSchema,
	updateCandidateProfileSchema,
} from '@/schemas/candidate-profile-schema'
import { authDreamJobs } from '../middlewares/authDreamJobs'

/**
 * Escreve no currículo do candidato — merge parcial, cria se não existir.
 *
 * PATCH e POST fazem a mesma coisa de propósito: "criar" e "atualizar" um
 * currículo é a mesma operação quando várias fontes o alimentam em ordem
 * imprevisível. Antes, o POST falhava com "Profile already exists" e o PATCH
 * com "Profile not found" — o cliente tinha que adivinhar qual usar.
 */
export function updateCandidateProfile(app: FastifyInstance) {
	const profileService = createCandidateProfileService(app.infra)

	const routeConfig = {
		schema: {
			'x-surface': 'candidato',
			tags: ['dream_jobs'],
			security: [{ bearerAuth: [] }],
			summary: 'Create or update the candidate profile (partial merge)',
			description:
				'Merges the given fields into the living résumé. Omitted fields keep their value; ' +
				'the profile is created on first write. Source is recorded per field.',
			body: updateCandidateProfileSchema,
			response: { 200: candidateProfileSchema },
		},
	} as const

	async function handle(request: {
		getCurrentUser: () => Promise<string>
		body: Record<string, unknown>
	}) {
		const userId = await request.getCurrentUser()
		const profile = await profileService.updateProfile(userId, request.body, 'dashboard')
		return {
			...profile,
			missingFields: profileService.missingFields(profile),
		}
	}

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.patch('/dream-jobs/profile', routeConfig, async (request) => handle(request as never))

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post('/dream-jobs/profile', routeConfig, async (request) => handle(request as never))
}
