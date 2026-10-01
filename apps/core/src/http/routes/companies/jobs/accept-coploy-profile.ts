import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { assertJobInScope } from '@/lib/access-scope'
import { createCoployProfileAcceptanceService } from '@/lib/services/coploy-profile-acceptance-service'

/**
 * Aceitar o perfil Coploy compartilhado no lugar da entrevista (F5).
 * Leva à etapa seguinte à entrevista no quadro da vaga e grava o motivo.
 */
export function acceptCoployProfile(app: FastifyInstance) {
	const acceptance = createCoployProfileAcceptanceService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/jobs/:jobId/candidates/:candidateId/accept-coploy-profile',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Accept the shared Coploy profile in place of the interview',
					description:
						'Moves the candidate to the stage after the interview in this job pipeline and records ' +
						'"entrevista substituída pelo perfil Coploy" in the history. Refused when the job asks for the interview.',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					response: {
						200: z.object({ candidateId: z.string(), stage: z.string() }),
						400: z.object({ message: z.string() }),
						404: z.object({ message: z.string() }),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId, candidateId } = request.params
				await assertJobInScope(app.infra, request, company.id, jobId)
				const actorId = await request.getCurrentUser()
				return acceptance.accept({ companyId: company.id, jobId, candidateId, actorId })
			},
		)
}
