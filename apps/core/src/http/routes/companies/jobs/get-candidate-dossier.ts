import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createCandidateDossierService } from '@/lib/services/candidate-dossier-service'
import { assertJobInScope } from '@/lib/access-scope'

const competencySchema = z.object({
	name: z.string(),
	score: z.number(),
	strengths: z.array(z.string()),
	gaps: z.array(z.string()),
	critical: z.boolean(),
})

const authenticitySchema = z
	.object({
		score: z.number().nullable(),
		humanPercent: z.number().nullable(),
		level: z.string().nullable(),
		summary: z.string().nullable(),
		criticalFactors: z.array(z.string()),
		indicators: z.array(
			z.object({
				label: z.string(),
				detail: z.string().nullable(),
				weight: z.number().nullable(),
			}),
		),
		signals: z.array(
			z.object({
				label: z.string(),
				detail: z.string().nullable(),
				severity: z.string().nullable(),
			}),
		),
		patterns: z.array(z.string()),
		contextNotes: z.array(z.string()),
	})
	.nullable()

/** Autenticidade por resposta — as métricas que sustentam o veredito global. */
const questionAuthenticitySchema = z
	.object({
		metrics: z.object({
			naturalness: z.number().nullable(),
			personalization: z.number().nullable(),
			complexity: z.number().nullable(),
			linguisticPatterns: z.number().nullable(),
			context: z.number().nullable(),
		}),
		observations: z.array(z.string()),
	})
	.nullable()

const questionSchema = z.object({
	id: z.string(),
	question: z.string(),
	score: z.number().nullable(),
	feedback: z.string().nullable(),
	analyze: z.string().nullable(),
	video: z.string().nullable(),
	audio: z.string().nullable(),
	skipped: z.boolean(),
	answered: z.boolean(),
	answer: z.string().nullable(),
	captions: z
		.array(z.object({ start: z.number(), end: z.number(), text: z.string() }))
		.nullable(),
	captionLanguages: z.array(z.string()),
	captionsByLanguage: z.record(
		z.string(),
		z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })),
	),
	strengths: z.array(z.string()),
	improvements: z.array(z.string()),
	authenticity: questionAuthenticitySchema,
})


/**
 * Dossiê do candidato numa vaga: tudo que a tela de detalhe precisa numa
 * chamada só, incluindo o contexto comparativo (média da vaga, posição) e a
 * trilha de tempo por etapa — que não existiam em endpoint nenhum.
 */
export function getCandidateDossier(app: FastifyInstance) {
	const dossierService = createCandidateDossierService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/jobs/:jobId/candidates/:candidateId/dossier',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Full candidate dossier for a job',
					description:
						'Perfil, entrevista com competências, trilha de tempo por etapa e ' +
						'benchmark contra os demais candidatos da vaga.',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					response: {
						200: z.object({
							/**
							 * Bloqueio SaaS (V2-704). `true` = crédito ainda não
							 * consumido para este candidato; a tela oferece o
							 * desbloqueio em vez de mostrar campos vazios.
							 */
							locked: z.boolean(),
							candidate: z
								.object({
									id: z.string(),
									name: z.string(),
									email: z.string().nullable(),
									phone: z.string().nullable(),
									photoUrl: z.string().nullable(),
									occupation: z.string().nullable(),
									headline: z.string().nullable(),
									summary: z.string().nullable(),
									yearsOfExperience: z.number().nullable(),
									location: z.string().nullable(),
									linkedinUrl: z.string().nullable(),
									resumeUrl: z.string().nullable(),
									experiences: z.array(z.record(z.string(), z.unknown())),
									education: z.array(z.record(z.string(), z.unknown())),
									languages: z.array(z.record(z.string(), z.unknown())),
								})
								.passthrough(),
							application: z.object({
								jobAppliedId: z.string(),
								jobId: z.string(),
								jobName: z.string().nullable(),
								stage: z.string(),
								appliedAt: z.string().nullable(),
								stageSince: z.string().nullable(),
								finished: z.boolean(),
								/** Progresso da entrevista: respondidas de total. */
								answeredCount: z.number(),
								questionTotal: z.number(),
								rejectionReasonCode: z.string().nullable(),
								rejectionReasonLabel: z.string().nullable(),
								rejectionNote: z.string().nullable(),
								rejectionEvidence: z.string().nullable(),
								rejectionDecisionSource: z.string().nullable(),
								/** Filtro de candidatura respondido — pergunta, resposta, o que reprovou. */
								screeningKnockout: z
									.object({
										passed: z.boolean().nullable(),
										answers: z.array(
											z.object({
												question: z.string(),
												answer: z.union([z.string(), z.number(), z.boolean()]).nullable(),
												failed: z.boolean(),
											}),
										),
									})
									.nullable(),
								/** Prova de entrevista verificada (OTS) — conteúdo consentido pelo candidato. */
								otsAttestation: z
									.object({
										tier: z.enum(['existence', 'summary', 'full']),
										iss: z.string(),
										companyName: z.string().nullable(),
										jobTitle: z.string().nullable(),
										completedAt: z.string(),
										questionsTotal: z.number().nullable(),
										outcome: z
											.object({
												score: z.number().nullable(),
												strengths: z.array(z.string()),
												developmentAreas: z.array(z.string()),
											})
											.nullable(),
										verifiedAt: z.string(),
										revocationStatus: z.string(),
										statusUrl: z.string(),
									})
									.nullable(),
							}),
							interview: z
								.object({
									score: z.number().nullable(),
									finishedAt: z.string().nullable(),
									questionCount: z.number(),
									durationSeconds: z.number().nullable(),
									summary: z.string().nullable(),
									recommendation: z.string().nullable(),
									strengths: z.array(z.string()),
									developmentAreas: z.array(z.string()),
									suggestions: z.array(z.string()),
									competencies: z.array(competencySchema),
									questions: z.array(questionSchema),
									languageEvaluation: z.record(z.string(), z.unknown()).nullable(),
									authenticity: authenticitySchema,
									translations: z.array(z.string()),
									translationsByLanguage: z.record(
										z.string(),
										z.object({
											summary: z.string().nullable(),
											recommendation: z.string().nullable(),
											strengths: z.array(z.string()),
											developmentAreas: z.array(z.string()),
											questions: z.array(
												z.object({
													feedback: z.string().nullable(),
													strengths: z.array(z.string()),
													improvements: z.array(z.string()),
													authenticity: questionAuthenticitySchema,
												}),
											),
											authenticity: authenticitySchema,
										}),
									),
								})
								.nullable(),
							job: z.object({
								/** Tipo e modo de fato usados nesta entrevista. */
								typeInterview: z.string().nullable(),
								interviewMode: z.string().nullable(),
								language: z.string().nullable(),
								description: z.string().nullable(),
								requirements: z.string().nullable(),
								responsibilities: z.string().nullable(),
								level: z.string().nullable(),
								model: z.string().nullable(),
								contractType: z.string().nullable(),
								mainSkills: z.string().nullable(),
								screeningObjective: z.string().nullable(),
							}),
							benchmark: z.object({
								jobAverage: z.number().nullable(),
								jobCandidates: z.number(),
								companyAverage: z.number().nullable(),
								rankInJob: z.number().nullable(),
								topPercent: z.number().nullable(),
							}),
							trail: z.object({
								daysInProcess: z.number().nullable(),
								daysInStage: z.number().nullable(),
								jobMedianDays: z.number().nullable(),
								slaHours: z.number().nullable(),
								atRisk: z.boolean(),
							}),
							/*
							 * Declarado campo a campo — a resposta é validada por schema,
							 * e o que não aparece aqui é calculado no servidor e some
							 * antes da tela. Já custou cinco investigações neste repo.
							 */
							skills: z.array(
								z.object({
									name: z.string(),
									verified: z.boolean(),
									/** Nota da skill na entrevista (0-10), quando avaliada. */
									score: z.number().nullable(),
									/** Quão forte foi a evidência: o que separa "citou" de "provou". */
									evidenceLevel: z.string().nullable(),
									/** O trecho que serviu de evidência — currículo diz, entrevista prova. */
									evidence: z.string().nullable(),
									/** A IA sinalizou que quer confirmação humana. */
									needsValidation: z.boolean(),
									source: z.enum(['assessed', 'mentioned', 'declared']),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId, candidateId } = request.params
				await assertJobInScope(app.infra, request, company.id, jobId)

				return dossierService.getDossier({ companyId: company.id, jobId, candidateId })
			},
		)
}
