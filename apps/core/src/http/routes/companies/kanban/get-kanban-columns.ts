import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKanbanService } from '@/lib/services/kanban-service'

export function getKanbanColumns(app: FastifyInstance) {
	const kanbanService = createKanbanService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/kanban-columns',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'List custom kanban columns catalog for the company',
					response: {
						200: z.object({
							columns: z.array(
								z.object({
									id: z.string(),
									label: z.string(),
									color: z.string(),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const columns = await kanbanService.getKanbanColumns(company.id)
				return { columns }
			},
		)
}
