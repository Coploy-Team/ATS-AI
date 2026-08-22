import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKanbanService } from '@/lib/services/kanban-service'

export function getKanbanConfig(app: FastifyInstance) {
	const kanbanService = createKanbanService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/jobs/:jobId/kanban-config',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'Get kanban configuration for a specific job',
					params: z.object({
						jobId: z.string(),
					}),
					response: {
						200: z.object({
							kanbanConfig: z.object({
								columns: z.array(
									z.object({
										id: z.string(),
										order: z.number(),
									}),
								),
								/** true = a vaga usa a régua padrão de etapas (não customizou colunas). */
								isDefault: z.boolean(),
								/**
								 * true = a vaga já passou pela configuração (etapas OU prazo de
								 * resposta). É isto, e não `isDefault`, que decide o convite de
								 * adoção — quem define só o SLA também configurou.
								 */
								configured: z.boolean(),
								/** Régua resolvida: rótulo, ordem e semântica de cada etapa. */
								stages: z.array(
									z.object({
										id: z.string(),
										order: z.number(),
										label: z.string(),
										labelEn: z.string(),
										color: z.string().nullable(),
										terminal: z.boolean(),
										offTrack: z.boolean(),
										canonical: z.boolean(),
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
				const kanbanConfig = await kanbanService.getKanbanConfig(company.id, jobId)
				return { kanbanConfig }
			},
		)
}
