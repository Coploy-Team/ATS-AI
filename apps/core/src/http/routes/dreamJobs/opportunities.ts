import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createOpportunitiesService } from '@/lib/services/opportunities-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'
import { jobDetailsSchema, jobSummarySchema } from '../careers/jobs'

/**
 * Feed de oportunidades do candidato, com compatibilidade determinística
 * (COP-11). Mesmas vagas do portal público e do MCP; o que muda é que aqui
 * a vaga chega com a leitura contra o perfil de QUEM pergunta — e por isso
 * a rota é autenticada, embora as vagas sejam públicas.
 */

const compatibilitySchema = z.object({
	score: z.number().int().min(0).max(100).nullable(),
	tags: z.array(
		z.object({
			kind: z.enum(['skill', 'level', 'modality']),
			label: z.string(),
			matched: z.boolean(),
		}),
	),
	missingProfileData: z.array(z.enum(['skills', 'level', 'workModalities'])),
	missingJobData: z.array(z.enum(['skills'])),
	components: z.number().int(),
})

const opportunitySchema = jobSummarySchema.extend({
	companyName: z.string(),
	companyLogo: z.string().nullable(),
	compatibility: compatibilitySchema,
	applied: z.boolean(),
})

const opportunityDetailsSchema = jobDetailsSchema.extend({
	companyName: z.string(),
	companyLogo: z.string().nullable(),
	compatibility: compatibilitySchema,
	applied: z.boolean(),
	/** A vaga aceita o perfil no lugar da entrevista (F5). Desligada: a empresa pede a entrevista. */
	acceptsCoployProfile: z.boolean(),
})

export function opportunitiesRoutes(app: FastifyInstance) {
	const opportunities = createOpportunitiesService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/dream-jobs/opportunities',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream_jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Open public jobs with deterministic compatibility against the candidate profile',
					description:
						'Same jobs as the public careers pages and the MCP search_jobs. Compatibility is a ' +
						'rule over skills, level and work modality — the unmatched tags are the explanation. ' +
						'A missing profile field never lowers the score: it is listed in missingProfileData instead.',
					querystring: z.object({
						query: z.string().max(120).optional(),
						occupation: z.string().max(120).optional(),
						location: z.string().max(120).optional(),
						workModality: z.enum(['remote', 'hybrid', 'onsite']).optional(),
						skill: z.string().max(80).optional(),
						minCompatibility: z.coerce.number().int().min(0).max(100).optional(),
						limit: z.coerce.number().int().min(1).max(100).optional(),
					}),
					response: {
						200: z.object({
							jobs: z.array(opportunitySchema),
							total: z.number().int(),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				return opportunities.list(userId, request.query)
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/dream-jobs/opportunities/:companyId/:jobId',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream_jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Public job details with compatibility against the candidate profile',
					params: z.object({
						companyId: z.string().min(1),
						jobId: z.string().min(1),
					}),
					response: {
						200: opportunityDetailsSchema,
						404: z.object({ message: z.string() }),
					},
				},
			},
			async (request, reply) => {
				const userId = await request.getCurrentUser()
				const details = await opportunities.get(userId, request.params.companyId, request.params.jobId)
				if (!details) return reply.status(404).send({ message: 'Job not found' })
				return details
			},
		)
}
