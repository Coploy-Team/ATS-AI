import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKanbanService } from '@/lib/services/kanban-service'

export function createKanbanColumn(app: FastifyInstance) {
	const kanbanService = createKanbanService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/kanban-columns',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'Create a new custom kanban column in the company catalog',
					body: z.object({
						label: z.string().min(1).max(50),
						color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
					}),
					response: {
						201: z.object({
							column: z.object({
								id: z.string(),
								label: z.string(),
								color: z.string(),
							}),
						}),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const { label, color } = request.body
				const column = await kanbanService.createKanbanColumn(company.id, { label, color })
				return reply.status(201).send({ column })
			},
		)
}
