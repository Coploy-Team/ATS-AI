import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { createCandidateProfileService } from '@/lib/services/candidate-profile-service'
import { candidateProfileSchema } from '@/schemas/candidate-profile-schema'
import { authDreamJobs } from '../middlewares/authDreamJobs'

/**
 * Currículo do candidato autenticado.
 *
 * Sempre responde 200: perfil vazio não é erro, é um currículo por começar —
 * `completeness` e `missingFields` dizem o que ainda falta, e é isso que o
 * assistente usa pra pedir os dados na conversa.
 */
export function getCandidateProfile(app: FastifyInstance) {
	const profileService = createCandidateProfileService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/dream-jobs/profile',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream_jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Get candidate profile (living résumé)',
					response: { 200: candidateProfileSchema },
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const profile = await profileService.getProfile(userId)
				return {
					...profile,
					missingFields: profileService.missingFields(profile),
				}
			},
		)
}
