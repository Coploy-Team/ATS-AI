import { SCORECARD_RECOMMENDATIONS } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createScorecardService } from '@/lib/services/scorecard-service'

const criterionSchema = z.object({
	id: z.string(),
	label: z.string(),
	/** 1–5. Escala curta de propósito: 0–10 vira ruído entre avaliadores. */
	rating: z.number().min(1).max(5).nullable(),
	note: z.string().max(600).nullable().optional(),
})

const scorecardSchema = z.object({
	id: z.string(),
	companyId: z.string(),
	jobId: z.string(),
	candidateId: z.string(),
	authorId: z.string(),
	authorName: z.string().nullable().optional(),
	criteria: z.array(criterionSchema),
	recommendation: z.enum(SCORECARD_RECOMMENDATIONS),
	comment: z.string().nullable().optional(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
})

/**
 * Avaliação do recrutador (V2-302).
 *
 * A nota humana convive com a da IA sem se misturar — a resposta entrega as
 * duas separadas para a tela mostrar lado a lado.
 */
export function scorecardRoutes(app: FastifyInstance) {
	const service = createScorecardService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/jobs/:jobId/candidates/:candidateId/scorecards',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['scorecards'],
					security: [{ bearerAuth: [] }],
					summary: 'List recruiter scorecards for a candidate',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					response: {
						200: z.object({
							scorecards: z.array(scorecardSchema),
							summary: z.object({
								count: z.number(),
								average: z.number().nullable(),
								consensus: z.enum(['positive', 'negative']).nullable(),
							}),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId, candidateId } = request.params
				return service.listScorecards({ companyId: company.id, jobId, candidateId })
			},
		)
		.put(
			'/companies/jobs/:jobId/candidates/:candidateId/scorecards',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['scorecards'],
					security: [{ bearerAuth: [] }],
					summary: 'Create or update my scorecard for this candidate',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					body: z.object({
						criteria: z.array(criterionSchema).default([]),
						recommendation: z.enum(SCORECARD_RECOMMENDATIONS),
						comment: z.string().max(2000).nullable().optional(),
					}),
					response: { 200: z.object({ scorecard: scorecardSchema }) },
				},
			},
			async (request) => {
				const { company, user } = (await request.getUserMembership()) as {
					company: { id: string }
					user?: { display_name?: string | null }
				}
				const authorId = await request.getCurrentUser()
				const { jobId, candidateId } = request.params

				const scorecard = await service.upsertScorecard({
					companyId: company.id,
					jobId,
					candidateId,
					authorId,
					authorName: user?.display_name ?? null,
					criteria: request.body.criteria,
					recommendation: request.body.recommendation,
					comment: request.body.comment ?? null,
				})
				return { scorecard }
			},
		)
}
