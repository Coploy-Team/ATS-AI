import type { InterviewResultTranslation, JobApplied } from '@coploy/domain'

import { translateJson } from '@/lib/translation-client'
import { buildWebVtt, createInterviewTranslationService } from '../interview-translation-service'
import { createMockInfra } from './mock-infra'

jest.mock('@/lib/translation-client', () => ({
	translateJson: jest.fn(),
}))

const mockTranslateJson = translateJson as jest.MockedFunction<typeof translateJson>

describe('createInterviewTranslationService', () => {
	const COMPANY_ID = 'company-123'
	const USER_ID = 'user-abc'
	const JOB_ID = 'job-xyz'
	const JOB_APPLIED_ID = 'jobapplied-999'
	const QUESTION_ID = 'q1'
	const company = { id: COMPANY_ID, companyName: 'Coploy', subscriptionPlan: 'enterprise' }

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createInterviewTranslationService>
	let jobApplied: JobApplied
	let lastTransactionUpdate: Record<string, unknown> | undefined

	const finishedInterview = {
		id: 'interview-1',
		companyId: COMPANY_ID,
		finished: true,
		date: new Date('2024-04-03').toISOString(),
		dateSelect: null,
		name: 'Ana Silva',
		user_ref: { id: USER_ID, path: `users/${USER_ID}` },
		job_applied_ref: {
			id: JOB_APPLIED_ID,
			path: `users/${USER_ID}/jobsApplied/${JOB_APPLIED_ID}`,
		},
		job_ref: { id: JOB_ID },
		candidateStatus: 'Pending',
	}

	function makeJobApplied(overrides: Partial<JobApplied> = {}): JobApplied {
		return {
			id: JOB_APPLIED_ID,
			appliedTime: new Date('2024-04-01'),
			jobApplied: { id: JOB_ID },
			isPracticing: false,
			finished: true,
			finishedTime: new Date('2024-04-03'),
			candidateStatus: 'Pending',
				evaluationLanguage: 'pt-BR',
				avaliacaoFinal: {
					score: 8,
					pontuacao_final: 82,
					nivel: 'alto',
					resumo: 'Bom desempenho geral',
					competencias_criticas: [
						{
							nome: 'Arquitetura',
							pontuacao: 9,
							score: 8,
							pontos_fortes: ['Desenho consistente'],
							pontos_desenvolvimento: ['Detalhar tradeoffs'],
						},
					],
					competencias_adicionais: [
						{
							nome: 'Comunicação',
							pontuacao: 7,
							score: 7,
							pontos_fortes: ['Clareza'],
							pontos_desenvolvimento: ['Sintetizar'],
						},
					],
					atendimento_expectativas: [
						{
							nome: 'Senioridade',
							nivel_atendimento: 4,
							evidencias: ['Liderou entregas'],
							gaps: ['Mais escala'],
						},
					],
					recomendacoes: {
						pontos_fortes: ['Comunicação objetiva'],
						areas_desenvolvimento: ['Aprofundar exemplos técnicos'],
						sugestoes_melhoria: ['Trazer métricas'],
					},
				},
			languageEvaluation: {
				score: 7,
				nivel: 'B2',
				feedback: 'Boa fluência',
				analise: 'Comunicação clara',
			},
			interview: {
				id: 'int-1',
				generalFeedback: 'Bom candidato',
				generalStrengths: ['Explica bem decisões'],
				generalImprovement: ['Detalhar mais métricas'],
				recomentation: 'Avançar para próxima etapa',
					score: 8,
					scom: 9,
					sres: 8,
					stec: 7,
					aderencia_descricao: 8,
					alinhamento_responsabilidades: 7,
					requisitos_atendidos: 9,
					alinhamento_nivel: 6,
					gap_para_proximo_nivel: 2,
					estruturacao: 8,
					exemplificacao: 7,
					profundidade: 6,
					nivel_confianca: 9,
					info: [
					{
						id: QUESTION_ID,
						score: 8,
						feedback: 'Resposta consistente',
						analyze: 'Trouxe exemplos relevantes',
						strengths: ['Clareza'],
						improvement: ['Mais profundidade'],
						qRecomendation: 'Aprovar',
						skills: 'Comunicação',
							languageScore: 7,
							languageFeedback: 'Boa pronúncia',
							languageAnalise: 'Vocabulário adequado',
							score_detalhado: {
								qualidade_resposta: {
									profundidade: 4,
									estruturacao: 5,
								},
							},
							metricas_decisao: {
								confianca: 0.89,
							},
							captionSegments: [
							{ start: 1.2, end: 3.45, text: 'Olá, eu lidero APIs.' },
							{ start: 4, end: 5.25, text: 'Também acompanho métricas.' },
						],
					},
				],
			},
			...overrides,
		}
	}

	beforeEach(() => {
		jest.clearAllMocks()
		lastTransactionUpdate = undefined
		infra = createMockInfra()
		service = createInterviewTranslationService(infra)
		jobApplied = makeJobApplied()
		infra.userRepository.getUser.mockResolvedValue({
			display_name: 'Ana Silva',
			email: 'ana@example.com',
			phone_number: null,
			photo_url: null,
			interview_tags: [],
		} as never)
		infra.candidateRepository.listCompanyInterviews.mockResolvedValue([finishedInterview] as never)
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobApplied as never)
		infra.jobRepository.getJob.mockResolvedValue({
			typeInterview: 'interview',
			evaluateLanguage: true,
			language: null,
		} as never)
		infra.aiUsageRepository.create.mockResolvedValue(undefined as never)
		infra.candidateRepository.updateJobAppliedInTransaction.mockImplementation(
			async (_userId, _id, updateFn) => {
				lastTransactionUpdate = updateFn(jobApplied) as Record<string, unknown>
			},
		)
	})

	it('resolves source language from PostJob language and translates EN interview when PT is selected', async () => {
		jobApplied = makeJobApplied({
			evaluationLanguage: undefined,
			language: undefined,
			interview: {
				...makeJobApplied().interview!,
				generalFeedback: 'Strong candidate',
				recomentation: 'Move forward',
			},
		})
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobApplied as never)
		infra.jobRepository.getJob.mockResolvedValue({
			typeInterview: 'interview',
			evaluateLanguage: true,
			language: 'en',
		} as never)
		mockTranslateJson.mockResolvedValue({
			translated: {
				interview: {
					generalFeedback: 'Candidato forte',
					recomentation: 'Avançar',
					score: 1,
					info: [{ id: QUESTION_ID, feedback: 'Resposta consistente', score: 1 }],
				},
				avaliacaoFinal: { score: 1, resumo: 'Bom desempenho geral' },
				languageEvaluation: { score: 1, nivel: 'B2', feedback: 'Boa fluência', analise: 'Clara' },
			},
			model: 'gpt-4o-mini',
			provider: 'openai',
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
		})

		const result = await service.getTranslatedResult({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			company,
			language: 'pt-BR',
		})

		expect(infra.jobRepository.getJob).toHaveBeenCalledWith(COMPANY_ID, JOB_ID)
		expect(result.sourceLanguage).toBe('en')
		expect(result.cached).toBe(false)
		expect(mockTranslateJson).toHaveBeenCalledWith(
			expect.objectContaining({
				targetLanguage: 'pt-BR',
				sourceLanguage: 'en',
			}),
		)
		expect(result.result.interview?.generalFeedback).toBe('Candidato forte')
		expect(result.result.interview?.score).toBe(8)
	})

	it('translates result prose, preserves numeric scores, caches it, and records translate usage', async () => {
		const translated: InterviewResultTranslation = {
			interview: {
				generalFeedback: 'Good candidate',
				score: 8,
				info: [
					{
						id: QUESTION_ID,
						score: 8,
						feedback: 'Consistent answer',
						languageScore: 7,
					},
				],
			},
			avaliacaoFinal: {
				score: 8,
				resumo: 'Good overall performance',
			},
			languageEvaluation: {
				score: 7,
				nivel: 'B2',
				feedback: 'Good fluency',
				analise: 'Clear communication',
			},
		}
		mockTranslateJson.mockResolvedValue({
			translated,
			model: 'gpt-4o-mini',
			provider: 'openai',
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
		})

		const result = await service.getTranslatedResult({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			company,
			language: 'en',
			requestId: 'req-1',
		})

		expect(result.cached).toBe(false)
		expect(result.result.interview?.score).toBe(8)
		expect((result.result.interview?.info as Array<Record<string, unknown>>)[0].score).toBe(8)
		expect(mockTranslateJson).toHaveBeenCalledTimes(1)
		expect(infra.candidateRepository.updateJobAppliedInTransaction).toHaveBeenCalledWith(
			USER_ID,
			JOB_APPLIED_ID,
			expect.any(Function),
		)
		expect(infra.aiUsageRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				surface: 'translate',
				jobAppliedId: JOB_APPLIED_ID,
				userId: USER_ID,
				model: 'gpt-4o-mini',
				metadata: expect.objectContaining({ kind: 'result', targetLanguage: 'en' }),
			}),
		)
	})

	it('returns cached result translation without calling the LLM', async () => {
		const cached: InterviewResultTranslation = {
			interview: { generalFeedback: 'Good candidate', score: 8 },
			avaliacaoFinal: null,
			languageEvaluation: null,
		}
		jobApplied = makeJobApplied({
			interview: {
				...makeJobApplied().interview!,
				// o cache carrega a versão do payload; sem ela o service o considera
				// desatualizado e regera (ver TRANSLATION_PAYLOAD_VERSION)
				translationCache: { en: { ...cached, translationVersion: 2 } },
			},
		})
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobApplied as never)

		const result = await service.getTranslatedResult({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			company,
			language: 'en',
		})

		expect(result.cached).toBe(true)
		// identidade não serve mais: o cache carrega `translationVersion`
		expect(result.result).toEqual({ ...cached, translationVersion: 2 })
		expect(mockTranslateJson).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateJobAppliedInTransaction).not.toHaveBeenCalled()
		expect(infra.aiUsageRepository.create).not.toHaveBeenCalled()
	})

	it('generates source-language VTT without calling the LLM', async () => {
		const result = await service.getCaptionVtt({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			questionId: QUESTION_ID,
			company,
			language: 'pt-BR',
		})

		expect(result.cached).toBe(true)
		expect(result.vtt).toContain('WEBVTT')
		expect(result.vtt).toContain('00:00:01.200 --> 00:00:03.450')
		expect(result.vtt).toContain('Olá, eu lidero APIs.')
		expect(mockTranslateJson).not.toHaveBeenCalled()
	})

	it('translates caption text, preserves timings, caches segments, and records usage', async () => {
		mockTranslateJson.mockResolvedValue({
			translated: {
				segments: [
					{ index: 0, text: 'Hello, I lead APIs.' },
					{ index: 1, text: 'I also monitor metrics.' },
				],
			},
			model: 'gpt-4o-mini',
			provider: 'openai',
			usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
		})

		const result = await service.getCaptionVtt({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			questionId: QUESTION_ID,
			company,
			language: 'en-US',
			requestId: 'req-2',
		})

		expect(result.cached).toBe(false)
		expect(result.language).toBe('en')
		expect(result.vtt).toContain('00:00:01.200 --> 00:00:03.450')
		expect(result.vtt).toContain('Hello, I lead APIs.')
		expect(infra.candidateRepository.updateJobAppliedInTransaction).toHaveBeenCalledWith(
			USER_ID,
			JOB_APPLIED_ID,
			expect.any(Function),
		)
		expect(infra.aiUsageRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				surface: 'translate',
				jobAppliedId: JOB_APPLIED_ID,
				metadata: expect.objectContaining({ kind: 'caption_vtt', questionId: QUESTION_ID }),
			}),
		)
	})

	it('resolves source language from PostJob language before translating caption VTT', async () => {
		jobApplied = makeJobApplied({
			evaluationLanguage: undefined,
			language: undefined,
		})
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobApplied as never)
		infra.jobRepository.getJob.mockResolvedValue({
			typeInterview: 'interview',
			evaluateLanguage: true,
			language: 'en',
		} as never)
		mockTranslateJson.mockResolvedValue({
			translated: {
				segments: [
					{ index: 0, text: 'Ola, eu lidero APIs.' },
					{ index: 1, text: 'Tambem acompanho metricas.' },
				],
			},
			model: 'gpt-4o-mini',
			provider: 'openai',
			usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
		})

		const result = await service.getCaptionVtt({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			questionId: QUESTION_ID,
			company,
			language: 'pt-BR',
		})

		expect(result.sourceLanguage).toBe('en')
		expect(result.cached).toBe(false)
		expect(mockTranslateJson).toHaveBeenCalledWith(
			expect.objectContaining({
				targetLanguage: 'pt-BR',
				sourceLanguage: 'en',
			}),
		)
		expect(result.vtt).toContain('Ola, eu lidero APIs.')
	})

	it('returns cached caption translation without calling the LLM', async () => {
		jobApplied = makeJobApplied({
			interview: {
				...makeJobApplied().interview!,
				info: [
					{
						...makeJobApplied().interview!.info![0],
						captionTranslations: {
							en: [{ start: 1.2, end: 3.45, text: 'Hello, I lead APIs.' }],
						},
					},
				],
			},
		})
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobApplied as never)

		const result = await service.getCaptionVtt({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			questionId: QUESTION_ID,
			company,
			language: 'en',
		})

		expect(result.cached).toBe(true)
		expect(result.vtt).toContain('Hello, I lead APIs.')
		expect(mockTranslateJson).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateJobAppliedInTransaction).not.toHaveBeenCalled()
		expect(infra.aiUsageRepository.create).not.toHaveBeenCalled()
	})

	it('getTranslatedResult returns original without calling LLM when language equals sourceLanguage', async () => {
		const result = await service.getTranslatedResult({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			company,
			language: 'pt-BR',
		})

		expect(result.cached).toBe(true)
		expect(result.language).toBe('pt-BR')
		expect(result.sourceLanguage).toBe('pt-BR')
		// Numbers must be preserved on the original payload
		expect(result.result.interview?.score).toBe(8)
		expect(mockTranslateJson).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateJobAppliedInTransaction).not.toHaveBeenCalled()
		expect(infra.aiUsageRepository.create).not.toHaveBeenCalled()
	})

	it('getTranslatedResult miss then hit: second call returns cached result without calling LLM again', async () => {
		const translated: InterviewResultTranslation = {
			interview: { generalFeedback: 'Good candidate', score: 8 },
			avaliacaoFinal: { score: 8, resumo: 'Good overall' },
			languageEvaluation: null,
		}
		mockTranslateJson.mockResolvedValue({
			translated,
			model: 'gpt-4o-mini',
			provider: 'openai',
			usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
		})

		// First call: cache miss → calls LLM
		const firstResult = await service.getTranslatedResult({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			company,
			language: 'en',
		})
		expect(firstResult.cached).toBe(false)
		expect(mockTranslateJson).toHaveBeenCalledTimes(1)
		expect(infra.aiUsageRepository.create).toHaveBeenCalledTimes(1)

		// Simulate the cache now being populated (as if the transaction persisted)
		const jobAppliedWithCache = makeJobApplied({
			interview: {
				...makeJobApplied().interview!,
				translationCache: { en: { ...translated, translationVersion: 2 } },
			},
		})
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobAppliedWithCache as never)

		// Second call: cache hit → no LLM, no usage event
		const secondResult = await service.getTranslatedResult({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			company,
			language: 'en',
		})
		expect(secondResult.cached).toBe(true)
		expect(secondResult.result).toEqual({ ...translated, translationVersion: 2 })
		expect(mockTranslateJson).toHaveBeenCalledTimes(1) // still 1, no new call
		expect(infra.aiUsageRepository.create).toHaveBeenCalledTimes(1) // still 1
	})

	it('getTranslatedResult preserves all numeric fields across the translated payload', async () => {
		const translated: InterviewResultTranslation = {
			interview: {
				generalFeedback: 'Good candidate',
				score: 1,
				scom: 1,
				sres: 1,
				stec: 1,
				aderencia_descricao: 1,
				alinhamento_responsabilidades: 1,
				requisitos_atendidos: 1,
				alinhamento_nivel: 1,
				gap_para_proximo_nivel: 1,
				estruturacao: 1,
				exemplificacao: 1,
				profundidade: 1,
				nivel_confianca: 1,
				info: [
					{
						id: QUESTION_ID,
						score: 1,
						languageScore: 1,
						feedback: 'Consistent answer',
						score_detalhado: {
							qualidade_resposta: {
								profundidade: 1,
								estruturacao: 1,
							},
						},
						metricas_decisao: {
							confianca: 0.1,
						},
					},
				],
			},
			avaliacaoFinal: {
				score: 1,
				pontuacao_final: 1,
				nivel: 'high',
				resumo: 'Good overall',
				competencias_criticas: [
					{
						nome: 'Architecture',
						pontuacao: 1,
						score: 1,
						pontos_fortes: ['Good design'],
						pontos_desenvolvimento: ['Detail tradeoffs'],
					},
				],
				competencias_adicionais: [
					{
						nome: 'Communication',
						pontuacao: 1,
						score: 1,
						pontos_fortes: ['Clear'],
						pontos_desenvolvimento: ['Synthesize'],
					},
				],
				atendimento_expectativas: [
					{
						nome: 'Seniority',
						nivel_atendimento: 1,
						evidencias: ['Led deliveries'],
						gaps: ['More scale'],
					},
				],
			},
			languageEvaluation: { score: 1, nivel: 'B2 translated', feedback: 'Good fluency', analise: 'Clear communication' },
		}
		mockTranslateJson.mockResolvedValue({
			translated,
			model: 'gpt-4o-mini',
			provider: 'openai',
			usage: { promptTokens: 200, completionTokens: 80, totalTokens: 280 },
		})

		const result = await service.getTranslatedResult({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			company,
			language: 'fr',
		})

		expect(result.result.interview?.score).toBe(8)
		expect((result.result.interview as Record<string, unknown>)?.scom).toBe(9)
		expect((result.result.interview as Record<string, unknown>)?.sres).toBe(8)
		expect((result.result.interview as Record<string, unknown>)?.stec).toBe(7)
		expect((result.result.interview as Record<string, unknown>)?.aderencia_descricao).toBe(8)
		expect((result.result.interview as Record<string, unknown>)?.alinhamento_responsabilidades).toBe(7)
		expect((result.result.interview as Record<string, unknown>)?.requisitos_atendidos).toBe(9)
		expect((result.result.interview as Record<string, unknown>)?.alinhamento_nivel).toBe(6)
		expect((result.result.interview as Record<string, unknown>)?.gap_para_proximo_nivel).toBe(2)
		expect((result.result.interview as Record<string, unknown>)?.estruturacao).toBe(8)
		expect((result.result.interview as Record<string, unknown>)?.exemplificacao).toBe(7)
		expect((result.result.interview as Record<string, unknown>)?.profundidade).toBe(6)
		expect((result.result.interview as Record<string, unknown>)?.nivel_confianca).toBe(9)
		const infoItem = (result.result.interview?.info as Array<Record<string, unknown>>)?.[0]
		expect(infoItem?.score).toBe(8)
		expect(infoItem?.languageScore).toBe(7)
		expect(infoItem?.score_detalhado).toEqual(jobApplied.interview?.info?.[0].score_detalhado)
		expect(infoItem?.metricas_decisao).toEqual(jobApplied.interview?.info?.[0].metricas_decisao)
		expect(result.result.avaliacaoFinal?.score).toBe(8)
		expect(result.result.avaliacaoFinal?.pontuacao_final).toBe(82)
		expect(result.result.avaliacaoFinal?.competencias_criticas?.[0].pontuacao).toBe(9)
		expect(result.result.avaliacaoFinal?.competencias_criticas?.[0].score).toBe(8)
		expect(result.result.avaliacaoFinal?.competencias_adicionais?.[0].pontuacao).toBe(7)
		expect(result.result.avaliacaoFinal?.competencias_adicionais?.[0].score).toBe(7)
		expect(result.result.avaliacaoFinal?.atendimento_expectativas?.[0].nivel_atendimento).toBe(4)
		expect(result.result.languageEvaluation?.score).toBe(7)
		const persistedCache = (lastTransactionUpdate?.['interview.translationCache'] as Record<string, InterviewResultTranslation>)?.fr
		expect(persistedCache?.interview?.score).toBe(8)
		expect(persistedCache?.avaliacaoFinal?.pontuacao_final).toBe(82)
		expect(persistedCache?.languageEvaluation?.score).toBe(7)
	})

	it('getTranslatedResult handles result without avaliacaoFinal (null) without throwing', async () => {
		const jobAppliedNoAvaliacao = makeJobApplied({ avaliacaoFinal: null, languageEvaluation: null })
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobAppliedNoAvaliacao as never)

		const translated: InterviewResultTranslation = {
			interview: { generalFeedback: 'Good candidate', score: 8 },
			avaliacaoFinal: null,
			languageEvaluation: null,
		}
		mockTranslateJson.mockResolvedValue({
			translated,
			model: 'gpt-4o-mini',
			provider: 'openai',
			usage: { promptTokens: 80, completionTokens: 30, totalTokens: 110 },
		})

		const result = await service.getTranslatedResult({
			userId: USER_ID,
			jobAppliedId: JOB_APPLIED_ID,
			company,
			language: 'es',
		})

		expect(result.result.avaliacaoFinal).toBeNull()
		expect(result.result.languageEvaluation).toBeNull()
		expect(mockTranslateJson).toHaveBeenCalledTimes(1)
	})

	it('getTranslatedResult handles info items with null feedback fields without throwing', async () => {
		const jobAppliedNullFields = makeJobApplied({
			interview: {
				...makeJobApplied().interview!,
				info: [
					{
						id: QUESTION_ID,
						score: 5,
						feedback: null,
						analyze: undefined,
						strengths: null,
						improvement: null,
					},
				],
			},
		})
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobAppliedNullFields as never)

		const translated: InterviewResultTranslation = {
			interview: {
				info: [{ id: QUESTION_ID, score: 5 }],
			},
			avaliacaoFinal: null,
			languageEvaluation: null,
		}
		mockTranslateJson.mockResolvedValue({
			translated,
			model: 'gpt-4o-mini',
			provider: 'openai',
			usage: { promptTokens: 60, completionTokens: 20, totalTokens: 80 },
		})

		await expect(
			service.getTranslatedResult({
				userId: USER_ID,
				jobAppliedId: JOB_APPLIED_ID,
				company,
				language: 'it',
			}),
		).resolves.toBeDefined()
	})

	it('getCaptionVtt throws BadRequestError when questionId is not found in interview.info', async () => {
		await expect(
			service.getCaptionVtt({
				userId: USER_ID,
				jobAppliedId: JOB_APPLIED_ID,
				questionId: 'nonexistent-question',
				company,
				language: 'en',
			}),
		).rejects.toThrow('Segmentos de legenda não encontrados')
	})

	it('getCaptionVtt throws BadRequestError when question has no captionSegments', async () => {
		const jobAppliedNoSegments = makeJobApplied({
			interview: {
				...makeJobApplied().interview!,
				info: [
					{
						id: QUESTION_ID,
						score: 8,
						feedback: 'Resposta consistente',
						captionSegments: [],
					},
				],
			},
		})
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobAppliedNoSegments as never)

		await expect(
			service.getCaptionVtt({
				userId: USER_ID,
				jobAppliedId: JOB_APPLIED_ID,
				questionId: QUESTION_ID,
				company,
				language: 'en',
			}),
		).rejects.toThrow('Segmentos de legenda não encontrados')
	})

	it('getCaptionVtt throws BadRequestError when question captionSegments is null/absent', async () => {
		const jobAppliedNoSegments = makeJobApplied({
			interview: {
				...makeJobApplied().interview!,
				info: [
					{
						id: QUESTION_ID,
						score: 8,
						feedback: 'Resposta consistente',
						// captionSegments intentionally absent
					},
				],
			},
		})
		infra.candidateRepository.getJobApplied.mockResolvedValue(jobAppliedNoSegments as never)

		await expect(
			service.getCaptionVtt({
				userId: USER_ID,
				jobAppliedId: JOB_APPLIED_ID,
				questionId: QUESTION_ID,
				company,
				language: 'fr',
			}),
		).rejects.toThrow('Segmentos de legenda não encontrados')
	})

	it('throws BadRequestError for unsupported language in getTranslatedResult', async () => {
		await expect(
			service.getTranslatedResult({
				userId: USER_ID,
				jobAppliedId: JOB_APPLIED_ID,
				company,
				language: 'zh',
			}),
		).rejects.toThrow('Idioma de tradução não suportado')
	})

	it('throws BadRequestError for unsupported language in getCaptionVtt', async () => {
		await expect(
			service.getCaptionVtt({
				userId: USER_ID,
				jobAppliedId: JOB_APPLIED_ID,
				questionId: QUESTION_ID,
				company,
				language: 'ja',
			}),
		).rejects.toThrow('Idioma de tradução não suportado')
	})
})

describe('buildWebVtt', () => {
	it('produces valid WebVTT header and cue format', () => {
		const vtt = buildWebVtt([
			{ start: 0, end: 1.5, text: 'Hello world' },
			{ start: 2, end: 3.999, text: 'Second cue' },
		])

		expect(vtt.startsWith('WEBVTT')).toBe(true)
		expect(vtt).toContain('00:00:00.000 --> 00:00:01.500')
		expect(vtt).toContain('Hello world')
		expect(vtt).toContain('00:00:02.000 --> 00:00:03.999')
		expect(vtt).toContain('Second cue')
		// Cues are separated by double newlines
		expect(vtt).toContain('\n\n')
	})

	it('formats hours correctly for long timestamps', () => {
		const vtt = buildWebVtt([
			{ start: 3661.5, end: 3720, text: 'Long video cue' },
		])

		expect(vtt).toContain('01:01:01.500 --> 01:02:00.000')
	})

	it('skips segments with empty or whitespace-only text', () => {
		const vtt = buildWebVtt([
			{ start: 0, end: 1, text: '' },
			{ start: 1, end: 2, text: '   ' },
			{ start: 2, end: 3, text: 'Visible cue' },
		])

		// Only the non-empty cue should be present
		expect(vtt).toContain('Visible cue')
		const cueCount = (vtt.match(/-->/g) ?? []).length
		expect(cueCount).toBe(1)
	})

	it('handles negative or non-finite start/end by clamping to zero', () => {
		const vtt = buildWebVtt([
			{ start: -5, end: -1, text: 'Bad timestamps' },
		])

		// Both clamped to 0 → 00:00:00.000 --> 00:00:00.000
		expect(vtt).toContain('00:00:00.000 --> 00:00:00.000')
		expect(vtt).toContain('Bad timestamps')
	})

	it('returns only WEBVTT header with trailing newline for empty segments', () => {
		const vtt = buildWebVtt([])

		expect(vtt).toBe('WEBVTT\n')
	})

	it('numbers cues sequentially starting at 1', () => {
		const vtt = buildWebVtt([
			{ start: 0, end: 1, text: 'First' },
			{ start: 1, end: 2, text: 'Second' },
		])

		const lines = vtt.split('\n')
		// After WEBVTT header + blank line, cue numbers appear
		expect(lines).toContain('1')
		expect(lines).toContain('2')
	})
})
