import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import {
	CollaboratorSchema,
	updateCollaboratorSchema,
} from '@/schemas/collaborator-schema'
import { createCollaboratorService } from '@/lib/services/collaborator-service'

export function updateCollaborator(app: FastifyInstance) {
	const collaboratorSvc = createCollaboratorService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.put(
			'/companies/collaborators/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['collaborators'],
					security: [{ bearerAuth: [] }],
					summary: 'Update a collaborator',
					params: z.object({
						id: z.string(),
					}),
					body: updateCollaboratorSchema,
					response: {
						200: z.object({
							collaborator: CollaboratorSchema,
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { id } = request.params
				const data = request.body

				return collaboratorSvc.updateCollaborator(company.id, id, data as Record<string, unknown>) as any
			},
		)
}
