import { STAGE_ACTIONS } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKanbanService } from '@/lib/services/kanban-service'

/**
 * Ações por etapa (V2-105).
 *
 * "Etapa aprovada" era um selo: mudava a cor do cartão e mais nada. Aqui ela
 * passa a ter consequência — entrou em Selecionados, sai o convite da
 * entrevista — sem que o recrutador precise lembrar de clicar.
 *
 * O conjunto de ações é fechado e vem do servidor na mesma resposta: motor de
 * regras genérico é como se chega num produto onde ninguém sabe explicar por
 * que um e-mail foi enviado.
 */
export function stageActionsRoutes(app: FastifyInstance) {
	const kanbanService = createKanbanService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/stage-actions',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'Actions configured for each pipeline stage',
					response: {
						200: z.object({
							actions: z.record(z.string(), z.array(z.string())),
							stages: z.array(z.object({ id: z.string(), label: z.string() })),
							available: z.array(z.string()),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return kanbanService.getStageActions(company.id)
			},
		)
		.put(
			'/companies/stage-actions',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'Save the actions each pipeline stage triggers',
					body: z.object({
						actions: z.record(z.string(), z.array(z.enum(STAGE_ACTIONS))),
					}),
					response: {
						200: z.object({ actions: z.record(z.string(), z.array(z.string())) }),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const actions = await kanbanService.saveStageActions(company.id, request.body.actions)
				return { actions }
			},
		)
}
