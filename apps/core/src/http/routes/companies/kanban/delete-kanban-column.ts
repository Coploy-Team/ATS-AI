import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKanbanService } from '@/lib/services/kanban-service'

export function deleteKanbanColumn(app: FastifyInstance) {
	const kanbanService = createKanbanService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.delete(
			'/companies/kanban-columns/:columnId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'Delete a custom kanban column from the company catalog',
					params: z.object({
						columnId: z.string(),
					}),
					response: {
						200: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { columnId } = request.params
				await kanbanService.deleteKanbanColumn(company.id, columnId)
				return { message: 'Column deleted successfully' }
			},
		)
}
