import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createCollaboratorService } from '@/lib/services/collaborator-service'

export function deleteCollaborator(app: FastifyInstance) {
	const collaboratorSvc = createCollaboratorService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.delete(
			'/companies/collaborators/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['collaborators'],
					security: [{ bearerAuth: [] }],
					summary: 'Delete a collaborator',
					params: z.object({
						id: z.string(),
					}),
					response: {
						204: z.void(),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { id } = request.params
				await collaboratorSvc.deleteCollaborator(company.id, id)
			},
		)
}
