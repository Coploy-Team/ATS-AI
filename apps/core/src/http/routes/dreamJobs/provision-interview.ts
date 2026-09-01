import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createProfileInterviewService } from '@/lib/services/profile-interview-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

const statusSchema = z.object({
	hasInterview: z.boolean(),
	jobId: z.string().nullable(),
	companyId: z.string().nullable(),
	status: z.enum(['not_started', 'pending', 'in_progress', 'completed']),
	interviewUrl: z.string().nullable(),
	createdAt: z.string().nullable(),
	completedAt: z.string().nullable(),
})

const provisionResponseSchema = statusSchema.extend({
	created: z.boolean(),
	jobName: z.string().nullable(),
	questionCount: z.number(),
})

/**
 * Entrevista de perfil do candidato — orquestração server-side.
 *
 * Substitui os 4 round-trips que o web/interview fazia no browser (3 chamadas de
 * IA + criação da vaga) por uma única chamada autenticada como candidato, o que
 * torna o fluxo reusável por qualquer canal (web, plugin ChatGPT/Claude, WhatsApp).
 *
 * Aberto a qualquer candidato autenticado: a entrevista de perfil não tem paywall.
 */
export function provisionProfileInterview(app: FastifyInstance) {
	const profileInterviewService = createProfileInterviewService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post(
			'/dream-jobs/interview',
			{
				config: {
					// Cada provisionamento custa 3 chamadas de IA — mesmo teto das rotas /ia
					rateLimit: rateLimitConfigs.ia,
				},
				schema: {
					'x-surface': 'candidato',
					tags: ['dream_jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Provision the candidate profile interview (Dream Jobs)',
					description:
						'Generates the mirror job (description, skills and questions) for the candidate profile ' +
						'and links it to the user. Idempotent: returns the existing interview when there is one.',
					body: z.object({
						occupation: z.string().min(2).describe('Cargo alvo do candidato'),
						level: z.string().min(2).describe('Nível (júnior, pleno, sênior...)'),
						language: z.string().optional().describe('Idioma da entrevista (default: idioma do perfil)'),
						objectives: z.string().max(2000).optional().describe('Objetivos profissionais'),
					}),
					response: { 201: provisionResponseSchema },
				},
			},
			async (request, reply) => {
				const userId = await request.getCurrentUser()
				const accessToken = await request.getAccessToken()

				const result = await profileInterviewService.provision(userId, request.body, {
					accessToken,
					requestId: request.id,
				})

				return reply.status(201).send(result)
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/dream-jobs/interview',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream_jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Get the candidate profile interview status',
					response: { 200: statusSchema },
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				return profileInterviewService.getStatus(userId)
			},
		)
}
