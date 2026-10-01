import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createCandidateInsightsService } from '@/lib/services/candidate-insights-service'
import { listAskedTopics } from '@/lib/services/asked-topics'
import { createOpportunitiesService } from '@/lib/services/opportunities-service'
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
	const opportunities = createOpportunitiesService(app.infra)

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
							/**
							 * "O que preciso estudar" (F3): skills que as vagas abertas
							 * pedem e o perfil não tem, por número de vagas. Regra, não
							 * modelo; o plano de estudo é do assistente do candidato.
							 */
							studyGaps: z.object({
								jobsConsidered: z.number().int(),
								gaps: z.array(z.object({ skill: z.string(), jobs: z.number().int() })),
								reason: z.enum(['no_profile_skills', 'no_matching_jobs']).nullable(),
							}),
							/**
							 * O que as empresas procuraram e a pessoa ainda não gravou:
							 * só o assunto e quantas empresas diferentes perguntaram, a
							 * partir de duas. O texto do recrutador nunca sai.
							 */
							askedTopics: z.array(z.object({ topic: z.string(), companies: z.number().int(), lastAskedAt: z.string() })),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const [insights, studyGaps, askedTopics] = await Promise.all([
					insightsService.getInsights(userId),
					// falha nas vagas não derruba a leitura das entrevistas
					opportunities.studyGaps(userId).catch(() => ({ jobsConsidered: 0, gaps: [], reason: 'no_matching_jobs' as const })),
					listAskedTopics(app.infra, userId).catch(() => []),
				])
				return { ...insights, studyGaps, askedTopics }
			},
		)
}
