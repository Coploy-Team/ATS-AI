import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createRankingService } from '@/lib/services/ranking-service'
import { assertJobInScope } from '@/lib/access-scope'

/**
 * Ranking explicável da vaga (V2-904).
 *
 * `enforcing: false` significa **shadow**: o cálculo aconteceu e foi registrado,
 * mas a tela não deve reordenar por ele ainda. A flag vem na resposta em vez de
 * a rota sumir — o cliente precisa saber a diferença entre "não há ranking" e
 * "há ranking em observação".
 */
export function getRanking(app: FastifyInstance) {
	const ranking = createRankingService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/jobs/:jobId/ranking',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Ranking dos candidatos da vaga, com explicação por candidato',
					description:
						'ML clássico determinístico em CPU. Cada posição vem com as 3 features de maior ' +
						'peso. Em shadow (`enforcing: false`), o ranking é calculado mas não deve ' +
						'reordenar a tela.',
					params: z.object({ jobId: z.string() }),
					response: {
						200: z.object({
							enforcing: z.boolean(),
							modelVersion: z.string(),
							candidates: z.array(
								z.object({
									jobAppliedId: z.string(),
									userId: z.string(),
									score: z.number(),
									position: z.number(),
									why: z.array(
										z.object({
											feature: z.string(),
											contribution: z.number(),
											value: z.number(),
										}),
									),
									modelVersion: z.string(),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				await assertJobInScope(app.infra, request, company.id, request.params.jobId)
				return ranking.rankJob({ companyId: company.id, jobId: request.params.jobId })
			},
		)
}
