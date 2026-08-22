import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createCandidateInsightsService } from '@/lib/services/candidate-insights-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

const dimensionSchema = z.enum(['structure', 'examples', 'depth'])

/**
 * O que o candidato aprende com as próprias entrevistas.
 *
 * O contrato é a garantia: não existe campo de nota, aderência ou aprovação
 * aqui. Se um dia alguém precisar do veredito, é outra rota, com outro dono.
 */
export function getMyInsights(app: FastifyInstance) {
	const insightsService = createCandidateInsightsService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/interviews/insights',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Career insights from the candidate own interviews',
					response: {
						200: z.object({
							interviewsAnalyzed: z.number(),
							dimensionRanking: z.array(dimensionSchema),
							strongestDimension: dimensionSchema.nullable(),
							dimensionToImprove: dimensionSchema.nullable(),
							improvingDimensions: z.array(dimensionSchema),
							recurringStrengths: z.array(z.string()),
							recurringDevelopment: z.array(z.string()),
							suggestions: z.array(z.string()),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				return insightsService.getInsights(userId)
			},
		)
}
