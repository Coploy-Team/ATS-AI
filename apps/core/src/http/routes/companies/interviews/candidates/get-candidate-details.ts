import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'
import { BadRequestError } from '@coploy/shared/errors'

// Campos de avaliação de idioma no item de `jobsApplied`. Todos opcionais
// e retrocompatíveis: entrevistas legadas (sem avaliação de idioma) seguem
// passando — `.passthrough()` preserva os outros campos do item (id,
// interview, batchProcessing, etc.). A flag `evaluateLanguage` vem da vaga
// (PostJob); `languageEvaluation` é o bloco final gravado pelo orchestrator.
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
		evaluateLanguage: z.boolean().nullable().optional(),
		languageEvaluation: languageEvaluationSchema,
	})
	.passthrough()

/**
 * Item de `interviews` do candidato.
 *
 * Era `z.record(z.string(), z.unknown())` — opaco. O gerador do SDK produzia
 * `{[key: string]: unknown}`, então qualquer cliente do contrato precisava
 * adivinhar o shape com cast. `.passthrough()` mantém a retrocompatibilidade
 * (o doc legado tem dezenas de campos), mas o que a UI de fato consome fica
 * declarado e tipado.
 *
 * `score` é `string | number` de propósito: o dado real tem os dois — o
 * orchestrator grava string em alguns caminhos e número em outros.
 */
const interviewItemSchema = z
	.object({
		id: z.string(),
		name: z.string().nullable().optional(),
		email: z.string().nullable().optional(),
		photo_url: z.string().nullable().optional(),
		occupation: z.string().nullable().optional(),
		score: z.union([z.number(), z.string()]).nullable().optional(),
		finished: z.boolean().nullable().optional(),
		candidateStatus: z.string().nullable().optional(),
		date: z.union([z.string(), z.date()]).nullable().optional(),
		dateSelect: z.union([z.string(), z.date()]).nullable().optional(),
		jobName: z.string().nullable().optional(),
		job_ref: z.string().nullable().optional(),
		job_applied_ref: z.string().nullable().optional(),
		user_ref: z.string().nullable().optional(),
		typeInterview: z.string().nullable().optional(),
		language: z.string().nullable().optional(),
	})
	.passthrough()

export function getCandidateDetails(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get<{ Params: { userId: string } }>(
			'/companies/user/:userId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Get details of a specific candidate by user ID',
					params: z.object({
						userId: z.string(),
					}),
					response: {
						200: z.object({
							candidate: z
								.object({
									id: z.string(),
									name: z.string().nullable(),
									email: z.string().nullable(),
									phone_number: z.string().nullable(),
									photo_url: z.string().nullable(),
									interviews: z.array(interviewItemSchema),
									averageScore: z.number().nullable(),
									lastInterview: z.string().nullable(),
									status: z.string().nullable(),
									jobsApplied: z.array(jobAppliedItemSchema),
									strengths: z.array(z.string()),
								})
								.passthrough(),
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
					const companyData = await request.getUserMembership()

					const result = await interviewsService.getCandidateDetails({
						userId,
						companyId: companyData.company.id,
						company: companyData.company,
					})

					if (!result) {
						return reply.status(404).send({ error: 'Usuário não encontrado' })
					}

					return result
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)
}
