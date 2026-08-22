import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '../middlewares/auth'
import { createUserService } from '@/lib/services/user-service'

const getUserJobAppliedParamsSchema = z.object({
	userId: z.string(),
	jobAppliedId: z.string(),
})

const CheatAnaliseSchema = z
	.object({
		resumo_executivo: z
			.object({
				pontuacao_autenticidade: z.number(),
				nivel_confianca: z.string(),
				parecer_principal: z.string(),
				fatores_criticos: z.array(z.string()),
			})
			.nullable()
			.optional(),
		analise_detalhada: z
			.object({
				indicadores_autenticidade: z.array(z.record(z.string(), z.unknown())),
				sinais_suspeitos: z.array(z.record(z.string(), z.unknown())),
				padroes_identificados: z.array(z.string()),
				consideracoes_contextuais: z.array(z.string()),
			})
			.nullable()
			.optional(),
		analise_por_resposta: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
		recomendacoes: z
			.object({
				nivel_risco: z.string(),
				acoes_sugeridas: z.array(z.string()),
				perguntas_validacao: z.array(z.string()),
				consideracoes_eticas: z.array(z.string()),
			})
			.nullable()
			.optional(),
		metadata: z
			.object({
				confiabilidade_analise: z.number(),
				limitacoes_aplicaveis: z.array(z.string()),
				versao_prompt: z.string(),
			})
			.nullable()
			.optional(),
	})
	.nullable()

const ExitJobResultSchema = z
	.object({
		executive_summary: z.string().nullable().optional(),
		extra_insights: z
			.object({
				contagion_risk: z.string().nullable().optional(),
				illustrative_quotes: z.array(z.string()).nullable().optional(),
				rehire_likelihood: z.string().nullable().optional(),
			})
			.nullable()
			.optional(),
		improvement_actions: z.array(z.string()).nullable().optional(),
		mapped_emotions: z
			.object({
				alegria: z.number().nullable().optional(),
				esperanca: z.number().nullable().optional(),
				frustracao: z.number().nullable().optional(),
				gratidao: z.number().nullable().optional(),
				raiva: z.number().nullable().optional(),
				tristeza: z.number().nullable().optional(),
			})
			.nullable()
			.optional(),
		negative_aspects: z
			.array(
				z
					.object({
						aspect: z.string().nullable().optional(),
						keywords: z.string().nullable().optional(),
						severity: z.string().nullable().optional(),
					})
					.nullable()
					.optional(),
			)
			.nullable()
			.optional(),
		positive_aspects: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
		reasons_over_time: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
		resignation_reasons: z
			.object({
				beneficios: z.number().nullable().optional(),
				carreira: z.number().nullable().optional(),
				cultura: z.number().nullable().optional(),
				equipe: z.number().nullable().optional(),
				gestao: z.number().nullable().optional(),
				outro: z.number().nullable().optional(),
				salario: z.number().nullable().optional(),
			})
			.nullable()
			.optional(),
	})
	.nullable()

export function getUserJobApplied(app: FastifyInstance) {
	const userService = createUserService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/users/:userId/jobs-applied/:jobAppliedId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['users'],
					security: [{ bearerAuth: [] }],
					summary: 'Get user job applied',
					params: getUserJobAppliedParamsSchema,
				response: {
					200: z.object({
						jobApplied: z
							.object({
								id: z.string(),
								appliedTime: z.date().nullable(),
								companyOwner: z.string().nullable(),
								finishedTime: z.date().nullable(),
								dateSelect: z.date().nullable(),
								userApplied: z.string().nullable(),
								jobApplied: z.string().nullable(),
								likes: z.array(z.record(z.string(), z.unknown())),
								totalLikes: z.number(),
								totalDislikes: z.number(),
								exitJobResult: ExitJobResultSchema,
								interview: z
									.object({
										cheat: CheatAnaliseSchema,
									})
									.catchall(z.any())
									.nullable(),
								whatsappTriagemResult: z
									.object({
										feedback_geral: z.string().nullable().optional(),
										porcentagem_match: z.number().nullable().optional(),
										recomendacao_recrutador: z.string().nullable().optional(),
										requisitos_atendidos: z
											.array(z.string())
											.nullable()
											.optional(),
										requisitos_nao_atendidos: z
											.array(z.string())
											.nullable()
											.optional(),
										pontos_atencao: z.array(z.string()).nullable().optional(),
										masked: z.boolean().optional(),
										message: z.string().optional(),
									})
									.nullable()
									.optional(),
							})
							.passthrough(),
					}),
					404: z.object({
						message: z.string(),
					}),
				},
				},
			},
			async (request, reply) => {
				try {
					await request.getCurrentUser()

					const params = getUserJobAppliedParamsSchema.parse(request.params)
					const { userId, jobAppliedId } = params

					const membership = await request.getUserMembership()

					const result = await userService.buildViewerJobAppliedDetail({
						userId,
						jobAppliedId,
						membership,
					})

					if (!result) {
						return reply
							.status(404)
							.send({ message: 'JobApplied não encontrado' })
					}

					return reply.status(200).send(result as any)
				} catch (error) {
					throw new BadRequestError(error as string)
				}
			},
		)
}
