import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createProfileRequestService } from '@/lib/services/profile-request-service'

/**
 * Pede ao candidato que complete o perfil.
 *
 * Fecha o beco da tela de detalhe: a trajetória vazia deixa de ser só um vazio
 * e vira uma ação. O e-mail explica o que falta e oferece os dois caminhos
 * (assistente e área do candidato).
 */
export function requestCandidateProfile(app: FastifyInstance) {
	const service = createProfileRequestService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/jobs/:jobId/candidates/:candidateId/request-profile',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Ask the candidate to complete their profile',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					body: z
						.object({ message: z.string().max(600).optional() })
						.optional()
						.default({}),
					response: {
						200: z.object({
							status: z.enum(['sent', 'no_email']),
							requested: z.array(z.string()),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId, candidateId } = request.params
				return service.requestProfile({
					companyId: company.id,
					jobId,
					candidateId,
					message: request.body?.message,
				})
			},
		)
}
