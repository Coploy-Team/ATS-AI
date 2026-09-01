import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKnockoutConfigService } from '@/lib/services/knockout-config-service'

const ruleValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.string()),
	z.array(z.number()),
	z.array(z.boolean()),
	z.null(),
])

const nodeSchema = z.object({
	id: z.string().min(1),
	question: z.string().min(3).max(500),
	type: z.enum(['boolean', 'single-choice', 'number']),
	options: z.array(z.string()).nullable().optional(),
	rule: z.object({
		operator: z.enum([
			'equals',
			'not_equals',
			'greater_than',
			'greater_than_or_equal',
			'less_than',
			'less_than_or_equal',
			'in',
			'not_in',
		]),
		value: ruleValueSchema,
	}),
	onFail: z.enum(['knockout', 'flag']),
	weight: z.number().nullable().optional(),
})

const treeSchema = z.object({
	version: z.number().int().min(1),
	nodes: z.array(nodeSchema).max(10),
})

/**
 * Configuração do screening knockout da vaga.
 *
 * Por que precisou existir: `job.knockoutTree` era LIDO pelo apply leve
 * (`job-application-service`), mas nenhuma rota escrevia o campo — nem
 * `create-job`, nem `patch-job`. O filtro automático de candidatura entregue
 * no Lançamento 1 era inalcançável: só funcionava pra quem gravasse o campo à
 * mão no banco.
 *
 * O teto de 10 perguntas é deliberado. Knockout longo vira o funil de 8
 * etapas que a pesquisa aponta como a dor nº1 do candidato
 * ; o filtro existe pra não gastar
 * entrevista com quem não atende requisito objetivo, não pra virar prova.
 */
export function jobKnockoutRoutes(app: FastifyInstance) {
	const knockoutService = createKnockoutConfigService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/jobs/:jobId/knockout',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Get the screening knockout tree of a job',
					params: z.object({ jobId: z.string() }),
					response: {
						200: z.object({
							knockoutTree: treeSchema.nullable(),
							/** false = a vaga nunca configurou; a UI convida (adoção §7). */
							configured: z.boolean(),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return knockoutService.getKnockout(company.id, request.params.jobId)
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.put(
			'/companies/jobs/:jobId/knockout',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Replace the screening knockout tree of a job',
					description:
						'Substitui a árvore inteira. A versão é incrementada pelo servidor — ' +
						'candidaturas já avaliadas guardam o snapshot da árvore que responderam.',
					params: z.object({ jobId: z.string() }),
					body: z.object({ nodes: z.array(nodeSchema).max(10) }),
					response: { 200: z.object({ knockoutTree: treeSchema }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return knockoutService.saveKnockout({
					companyId: company.id,
					jobId: request.params.jobId,
					nodes: request.body.nodes,
				})
			},
		)
}
