import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'
import { BadRequestError } from '@coploy/shared/errors'

// Bloco final de avaliação de idioma + item de `jobsApplied` no path público.
// Todos opcionais/retrocompatíveis (entrevistas legadas seguem passando).
// `evaluateLanguage` NÃO é exposto no path público (a vaga é de outra empresa);
// o front decide mostrar o bloco de idioma pela presença de
// `languageEvaluation !== null`. Em Hunting/SaaS sem crédito, o service mascara
// o job inteiro e `languageEvaluation` volta como null.
const languageEvaluationSchema = z
	.object({
		score: z.union([z.number(), z.string()]).nullable().optional(),
		nivel: z.string().nullable().optional(),
		feedback: z.string().nullable().optional(),
		analise: z.string().nullable().optional(),
	})
	.nullable()
	.optional()

const jobAppliedItemSchema = z
	.object({
		languageEvaluation: languageEvaluationSchema,
	})
	.passthrough()

export function getCandidateDetails(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get<{ Params: { userId: string } }>(
			'/public_interviews/user/:userId',
			{
				schema: {
					'x-surface': 'empresa',
					security: [{ bearerAuth: [] }],
					tags: ['public_interviews'],
					summary:
						'Get details of a specific candidate by user ID from public interviews',
					params: z.object({
						userId: z.string(),
					}),
					response: {
						200: z.object({
							candidate: z.object({
								id: z.string(),
								name: z.string().nullable(),
								email: z.string().nullable(),
								photo_url: z.string().nullable(),
								interviews: z.array(z.record(z.string(), z.unknown())),
								averageScore: z.number().nullable(),
								lastInterview: z.string().nullable(),
								status: z.string().nullable(),
								academic: z.string().nullable().optional(),
								phone_number: z.string().nullable().optional(),
								professional_experience: z.string().nullable().optional(),
								occupation: z.string().nullable().optional(),
								city: z.string().nullable().optional(),
								state: z.string().nullable().optional(),
								type_interview: z.string().nullable().optional(),
								career_level: z.string().nullable().optional(),
								jobsApplied: z.array(jobAppliedItemSchema),
							}),
						}),
						404: z.object({
							error: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				try {
					const { userId } = request.params
					const membership = await request.getUserMembership().catch(() => null)
					const company = membership?.company ?? null

					const result = await interviewsService.getPublicCandidateDetails({
						userId,
						company,
					})

					if (!result) {
						return reply.status(404).send({ error: 'Usuário não encontrado' })
					}

					return result
				} catch {
					throw new BadRequestError('Erro ao buscar detalhes do candidato')
				}
			},
		)
}
