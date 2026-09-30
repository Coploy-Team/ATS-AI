import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKanbanService } from '@/lib/services/kanban-service'

/**
 * Renomear e recolorir coluna custom do kanban (V2-104).
 *
 * Faltava nos dois produtos: o catálogo só tinha criar e excluir, então
 * corrigir um label errado significava apagar a coluna — e com ela a
 * associação dos candidatos que já estavam nela.
 */
export function updateKanbanColumn(app: FastifyInstance) {
	const kanbanService = createKanbanService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.patch(
			'/companies/kanban-columns/:columnId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'Rename or recolor a custom kanban column',
					params: z.object({ columnId: z.string() }),
					body: z
						.object({
							label: z.string().min(1).max(50).optional(),
							color: z
								.string()
								.regex(/^#[0-9A-Fa-f]{6}$/)
								.optional(),
						})
						.refine((body) => body.label !== undefined || body.color !== undefined, {
							message: 'Informe label ou color',
						}),
					response: {
						200: z.object({
							column: z.object({
								id: z.string(),
								label: z.string(),
								color: z.string(),
							}),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const column = await kanbanService.updateKanbanColumn(
					company.id,
					request.params.columnId,
					request.body,
				)
				return { column }
			},
		)
}
