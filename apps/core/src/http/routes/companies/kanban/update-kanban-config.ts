import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKanbanService } from '@/lib/services/kanban-service'

export function updateKanbanConfig(app: FastifyInstance) {
	const kanbanService = createKanbanService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.put(
			'/companies/jobs/:jobId/kanban-config',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'Update kanban configuration for a specific job',
					params: z.object({
						jobId: z.string(),
					}),
					body: z.object({
						columns: z.array(
							z.object({
								id: z.string(),
								order: z.number(),
							}),
						),
					}),
					response: {
						200: z.object({
							message: z.string(),
							kanbanConfig: z.object({
								columns: z.array(
									z.object({
										id: z.string(),
										order: z.number(),
									}),
								),
							}),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId } = request.params
				const { columns } = request.body
				const kanbanConfig = await kanbanService.updateKanbanConfig(company.id, jobId, columns)
				return { message: 'Kanban configuration updated successfully', kanbanConfig }
			},
		)
}
