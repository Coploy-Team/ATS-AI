import type {
	CaptionSegment,
	Company,
	InterviewInfoItem,
	InterviewResultTranslation,
	InterviewTranslationLanguage,
	JobApplied,
	PostJob,
} from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'

import { recordCoreAiUsage } from '@/lib/ai-usage'
import { translateJson } from '@/lib/translation-client'
import { createInterviewsService } from './interviews-service'

const SUPPORTED_LANGUAGES = ['pt-BR', 'en', 'es', 'fr', 'it'] as const

/**
 * Versão do payload de tradução.
 *
 * O conjunto de campos traduzidos cresce (autenticidade entrou depois; as
 * observações por resposta, depois ainda). Sem versão, a chave do idioma já
 * existia no cache e nada mais era gerado — o recrutador via metade da tela em
 * inglês para sempre. Subir este número invalida os caches antigos, que são
 * regerados no próximo acesso àquele idioma.
 */
const TRANSLATION_PAYLOAD_VERSION = 2

const LANGUAGE_ALIASES: Record<string, InterviewTranslationLanguage> = {
	pt: 'pt-BR',
	'pt-br': 'pt-BR',
	en: 'en',
	'en-us': 'en',
	'en-gb': 'en',
	es: 'es',
	'es-es': 'es',
	fr: 'fr',
	'fr-fr': 'fr',
	it: 'it',
	'it-it': 'it',
}

type TranslationCacheResult = {
	language: InterviewTranslationLanguage
	sourceLanguage: InterviewTranslationLanguage
	cached: boolean
	result: InterviewResultTranslation
}

type CaptionVttResult = {
	language: InterviewTranslationLanguage
	sourceLanguage: InterviewTranslationLanguage
	cached: boolean
	vtt: string
}

function normalizeTranslationLanguage(language: string | null | undefined): InterviewTranslationLanguage {
	const normalized = language?.trim().toLowerCase()
	const value = normalized ? LANGUAGE_ALIASES[normalized] : undefined
	if (!value) {
		throw new BadRequestError(`Idioma de tradução não suportado: ${language ?? ''}`)
	}
	return value
}

function safeNormalizeTranslationLanguage(language: string | null | undefined): InterviewTranslationLanguage | undefined {
	const normalized = language?.trim().toLowerCase()
	return normalized ? LANGUAGE_ALIASES[normalized] : undefined
}

async function resolveSourceLanguage(params: {
	infra: InfraProvider
	companyId: string
	jobApplied: JobApplied
}): Promise<InterviewTranslationLanguage> {
	const jobId = params.jobApplied.jobApplied?.id
	if (jobId) {
		try {
			const postJob = (await params.infra.jobRepository.getJob(params.companyId, jobId)) as
				| (PostJob & { language?: string | null })
				| null
			const fromPostJob = safeNormalizeTranslationLanguage(postJob?.language)
			if (fromPostJob) return fromPostJob
		} catch (error) {
			console.warn('[InterviewTranslationService] Falha ao resolver idioma da vaga:', error)
		}
	}

	return (
		safeNormalizeTranslationLanguage((params.jobApplied as { evaluationLanguage?: string | null }).evaluationLanguage) ??
		safeNormalizeTranslationLanguage((params.jobApplied as { language?: string | null }).language) ??
		'pt-BR'
	)
}

function pickDefined<T extends Record<string, unknown>>(source: T, keys: Array<keyof T>): Record<string, unknown> {
	const output: Record<string, unknown> = {}
	for (const key of keys) {
		const value = source[key]
		if (value !== undefined) output[String(key)] = value
	}
	return output
}

function buildResultPayload(jobApplied: JobApplied): InterviewResultTranslation {
	const interview = jobApplied.interview ?? null
	const interviewPayload = interview
		? {
				...pickDefined(interview as unknown as Record<string, unknown>, [
					'generalFeedback',
					'generalStrengths',
					'generalImprovement',
					'recomentation',
					'score',
					'scom',
					'sres',
					'stec',
					'aderencia_descricao',
					'alinhamento_responsabilidades',
					'requisitos_atendidos',
					'alinhamento_nivel',
					'gap_para_proximo_nivel',
					'estruturacao',
					'exemplificacao',
					'profundidade',
					'nivel_confianca',
				]),
				info: (interview.info ?? []).map((item) => ({
					...pickDefined(item as unknown as Record<string, unknown>, [
						'id',
						'score',
						'analyze',
						'feedback',
						'strengths',
						'improvement',
						'qRecomendation',
						'skills',
						'score_detalhado',
						'metricas_decisao',
						'languageScore',
						'languageFeedback',
						'languageAnalise',
					]),
				})),
			}
		: null

	return {
		interview: interviewPayload,
		avaliacaoFinal: jobApplied.avaliacaoFinal ?? null,
		languageEvaluation: jobApplied.languageEvaluation ?? null,
		cheat: (interview?.cheat as Record<string, unknown> | undefined) ?? null,
	}
}

function pickTranslatedValue<T>(translated: Record<string, unknown> | null | undefined, key: string, fallback: T): T {
	const value = translated?.[key]
	return value === undefined ? fallback : value as T
}

function pickTranslatedArray<T>(translated: Record<string, unknown> | null | undefined, key: string, fallback: T): T {
	const value = translated?.[key]
	return Array.isArray(value) ? value as T : fallback
}

function mergeTranslatedInterviewInfo(
	originalInfo: Array<Record<string, unknown>>,
	translatedInfo: Array<Record<string, unknown>>,
) {
	return originalInfo.map((item, index) => {
		const translated =
			translatedInfo.find((candidate) => candidate?.id && candidate.id === item?.id) ??
			translatedInfo[index] ??
			null
		return {
			...item,
			analyze: pickTranslatedValue(translated, 'analyze', item.analyze),
			feedback: pickTranslatedValue(translated, 'feedback', item.feedback),
			strengths: pickTranslatedArray(translated, 'strengths', item.strengths),
			improvement: pickTranslatedArray(translated, 'improvement', item.improvement),
			qRecomendation: pickTranslatedValue(translated, 'qRecomendation', item.qRecomendation),
			skills: pickTranslatedValue(translated, 'skills', item.skills),
			languageFeedback: pickTranslatedValue(translated, 'languageFeedback', item.languageFeedback),
			languageAnalise: pickTranslatedValue(translated, 'languageAnalise', item.languageAnalise),
		}
	})
}

function mergeTranslatedCompetencies(
	original: unknown,
	translated: unknown,
	textKeys: string[],
) {
	if (!Array.isArray(original)) return original
	const translatedItems = Array.isArray(translated) ? translated as Array<Record<string, unknown>> : []
	return original.map((item, index) => {
		if (!item || typeof item !== 'object') return item
		const base = item as Record<string, unknown>
		const candidate =
			translatedItems.find((translatedItem) => translatedItem?.nome && translatedItem.nome === base.nome) ??
			translatedItems[index] ??
			null
		return textKeys.reduce(
			(acc, key) => ({
				...acc,
				[key]: Array.isArray(acc[key])
					? pickTranslatedArray(candidate, key, acc[key])
					: pickTranslatedValue(candidate, key, acc[key]),
			}),
			{ ...base },
		)
	})
}

function mergeTranslatedEvaluation(
	original: Record<string, unknown> | null | undefined,
	translated: Record<string, unknown> | null | undefined,
) {
	if (!original) return original ?? null
	return {
		...original,
		competencias_criticas: mergeTranslatedCompetencies(
			original.competencias_criticas,
			translated?.competencias_criticas,
			['nome', 'pontos_fortes', 'pontos_desenvolvimento'],
		),
		competencias_adicionais: mergeTranslatedCompetencies(
			original.competencias_adicionais,
			translated?.competencias_adicionais,
			['nome', 'pontos_fortes', 'pontos_desenvolvimento'],
		),
		atendimento_expectativas: mergeTranslatedCompetencies(
			original.atendimento_expectativas,
			translated?.atendimento_expectativas,
			['nome', 'evidencias', 'gaps'],
		),
		recomendacoes: original.recomendacoes && typeof original.recomendacoes === 'object'
			? {
					...(original.recomendacoes as Record<string, unknown>),
					pontos_fortes: pickTranslatedArray(
						translated?.recomendacoes as Record<string, unknown> | null | undefined,
						'pontos_fortes',
						(original.recomendacoes as Record<string, unknown>).pontos_fortes,
					),
					areas_desenvolvimento: pickTranslatedArray(
						translated?.recomendacoes as Record<string, unknown> | null | undefined,
						'areas_desenvolvimento',
						(original.recomendacoes as Record<string, unknown>).areas_desenvolvimento,
					),
					sugestoes_melhoria: pickTranslatedArray(
						translated?.recomendacoes as Record<string, unknown> | null | undefined,
						'sugestoes_melhoria',
						(original.recomendacoes as Record<string, unknown>).sugestoes_melhoria,
					),
				}
			: original.recomendacoes,
		generalFeedback: pickTranslatedValue(translated, 'generalFeedback', original.generalFeedback),
		generalRecomendation: pickTranslatedValue(translated, 'generalRecomendation', original.generalRecomendation),
		resumo: pickTranslatedValue(translated, 'resumo', original.resumo),
		nivel: pickTranslatedValue(translated, 'nivel', original.nivel),
	}
}

/**
 * Merge da análise de autenticidade.
 *
 * Só texto é substituído: `pontuacao_autenticidade`, `peso` e as métricas por
 * resposta são números e um modelo de tradução pode "arredondar" um score sem
 * querer — a nota que sustenta a decisão não pode mudar ao trocar de idioma.
 */
function mergeTranslatedCheat(
	original: Record<string, unknown> | null | undefined,
	translated: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
	if (!original) return null
	if (!translated) return original

	const resumo = (original.resumo_executivo ?? {}) as Record<string, unknown>
	const resumoT = (translated.resumo_executivo ?? {}) as Record<string, unknown>
	const detalhada = (original.analise_detalhada ?? {}) as Record<string, unknown>
	const detalhadaT = (translated.analise_detalhada ?? {}) as Record<string, unknown>

	const mergeList = (
		base: unknown,
		other: unknown,
		fields: string[],
	): unknown => {
		if (!Array.isArray(base)) return base
		const list = Array.isArray(other) ? other : []
		return base.map((item, index) => {
			if (typeof item === 'string') {
				const candidate = list[index]
				return typeof candidate === 'string' ? candidate : item
			}
			const source = (item ?? {}) as Record<string, unknown>
			const target = (list[index] ?? {}) as Record<string, unknown>
			const out: Record<string, unknown> = { ...source }
			for (const field of fields) {
				if (typeof target[field] === 'string') out[field] = target[field]
			}
			return out
		})
	}

	return {
		...original,
		resumo_executivo: {
			...resumo,
			nivel_confianca: pickTranslatedValue(resumoT, 'nivel_confianca', resumo.nivel_confianca),
			parecer_principal: pickTranslatedValue(
				resumoT,
				'parecer_principal',
				resumo.parecer_principal,
			),
			fatores_criticos: mergeList(resumo.fatores_criticos, resumoT.fatores_criticos, []),
		},
		analise_detalhada: {
			...detalhada,
			indicadores_autenticidade: mergeList(
				detalhada.indicadores_autenticidade,
				detalhadaT.indicadores_autenticidade,
				['tipo', 'descricao'],
			),
			sinais_suspeitos: mergeList(detalhada.sinais_suspeitos, detalhadaT.sinais_suspeitos, [
				'tipo',
				'descricao',
				'severidade',
			]),
			padroes_identificados: mergeList(
				detalhada.padroes_identificados,
				detalhadaT.padroes_identificados,
				[],
			),
			consideracoes_contextuais: mergeList(
				detalhada.consideracoes_contextuais,
				detalhadaT.consideracoes_contextuais,
				[],
			),
		},
		/*
		 * Cada resposta tem `observacoes`, que é uma lista DENTRO do item — o
		 * merge genérico só troca campos de texto no primeiro nível, então as
		 * observações continuavam em inglês na aba "IA" enquanto o resto da tela
		 * já estava traduzido.
		 */
		analise_por_resposta: (Array.isArray(original.analise_por_resposta)
			? original.analise_por_resposta
			: []
		).map((item, index) => {
			const source = (item ?? {}) as Record<string, unknown>
			const target = (Array.isArray(translated.analise_por_resposta)
				? ((translated.analise_por_resposta[index] ?? {}) as Record<string, unknown>)
				: {}) as Record<string, unknown>
			return {
				...source,
				resumo_pergunta: pickTranslatedValue(target, 'resumo_pergunta', source.resumo_pergunta),
				observacoes: mergeList(source.observacoes, target.observacoes, []),
			}
		}),
	}
}

export function mergeTranslatedResult(
	original: InterviewResultTranslation,
	translated: InterviewResultTranslation,
): InterviewResultTranslation {
	const originalInterview = original.interview as Record<string, unknown> | null | undefined
	const translatedInterview = translated.interview as Record<string, unknown> | null | undefined
	const originalInfo = Array.isArray(originalInterview?.info)
		? originalInterview.info as Array<Record<string, unknown>>
		: []
	const translatedInfo = Array.isArray(translatedInterview?.info)
		? translatedInterview.info as Array<Record<string, unknown>>
		: []

	return {
		interview: originalInterview
			? {
					...originalInterview,
					generalFeedback: pickTranslatedValue(translatedInterview, 'generalFeedback', originalInterview.generalFeedback),
					generalStrengths: pickTranslatedArray(translatedInterview, 'generalStrengths', originalInterview.generalStrengths),
					generalImprovement: pickTranslatedArray(translatedInterview, 'generalImprovement', originalInterview.generalImprovement),
					recomentation: pickTranslatedValue(translatedInterview, 'recomentation', originalInterview.recomentation),
					info: mergeTranslatedInterviewInfo(originalInfo, translatedInfo),
				}
			: original.interview ?? null,
		avaliacaoFinal: mergeTranslatedEvaluation(
			original.avaliacaoFinal as Record<string, unknown> | null | undefined,
			translated.avaliacaoFinal as Record<string, unknown> | null | undefined,
		) as InterviewResultTranslation['avaliacaoFinal'],
		cheat: mergeTranslatedCheat(
			original.cheat as Record<string, unknown> | null | undefined,
			translated.cheat as Record<string, unknown> | null | undefined,
		),
		languageEvaluation: original.languageEvaluation
			? {
					...original.languageEvaluation,
					nivel: pickTranslatedValue(
						translated.languageEvaluation as Record<string, unknown> | null | undefined,
						'nivel',
						original.languageEvaluation.nivel,
					),
					feedback: pickTranslatedValue(
						translated.languageEvaluation as Record<string, unknown> | null | undefined,
						'feedback',
						original.languageEvaluation.feedback,
					),
					analise: pickTranslatedValue(
						translated.languageEvaluation as Record<string, unknown> | null | undefined,
						'analise',
						original.languageEvaluation.analise,
					),
				}
			: original.languageEvaluation ?? null,
	}
}

function findVisibleJobApplied(details: unknown, jobAppliedId: string): Record<string, unknown> | null {
	const candidate = (details as { candidate?: { jobsApplied?: Array<Record<string, unknown>> } } | null)?.candidate
	return candidate?.jobsApplied?.find((job) => job.id === jobAppliedId) ?? null
}

function assertNotMasked(visibleJobApplied: Record<string, unknown> | null) {
	if (!visibleJobApplied) {
		throw new BadRequestError('Entrevista não encontrada para esta empresa')
	}
	const interview = visibleJobApplied.interview as Record<string, unknown> | null | undefined
	if (!interview || interview.masked === true) {
		throw new BadRequestError('Conteúdo da entrevista bloqueado para esta empresa')
	}
}

function pad(value: number, size = 2) {
	return String(value).padStart(size, '0')
}

function formatVttTimestamp(seconds: number) {
	const totalMillis = Math.round((Number.isFinite(seconds) ? Math.max(0, seconds) : 0) * 1000)
	const hours = Math.floor(totalMillis / 3_600_000)
	const minutes = Math.floor((totalMillis % 3_600_000) / 60_000)
	const secs = Math.floor((totalMillis % 60_000) / 1000)
	const millis = totalMillis % 1000
	return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(millis, 3)}`
}

export function buildWebVtt(segments: CaptionSegment[]) {
	const cues = segments
		.filter((segment) => typeof segment.text === 'string' && segment.text.trim() !== '')
		.map((segment, index) => [
			String(index + 1),
			`${formatVttTimestamp(segment.start)} --> ${formatVttTimestamp(segment.end)}`,
			segment.text.trim(),
		].join('\n'))
	return ['WEBVTT', ...cues].join('\n\n') + '\n'
}

function mergeTranslatedSegments(
	base: CaptionSegment[],
	translated: { segments?: Array<{ index?: number; text?: string | null }> },
): CaptionSegment[] {
	const textByIndex = new Map<number, string>()
	for (const segment of translated.segments ?? []) {
		if (typeof segment.index === 'number' && typeof segment.text === 'string') {
			textByIndex.set(segment.index, segment.text)
		}
	}
	return base.map((segment, index) => ({
		start: segment.start,
		end: segment.end,
		text: textByIndex.get(index) ?? segment.text,
	}))
}

export function createInterviewTranslationService(infra: InfraProvider) {
	const interviewsService = createInterviewsService(infra)

	async function assertVisible(params: {
		userId: string
		jobAppliedId: string
		company: Company & { id: string }
	}) {
		const companyForMasking = {
			id: params.company.id,
			subscriptionPlan: params.company.subscriptionPlan ?? null,
			subscriptionDetails: params.company.subscriptionDetails
				? { plan: params.company.subscriptionDetails.plan ?? undefined }
				: null,
		}
		const details = await interviewsService.getCandidateDetails({
			userId: params.userId,
			companyId: params.company.id,
			company: companyForMasking,
		})
		assertNotMasked(findVisibleJobApplied(details, params.jobAppliedId))
	}

	async function getRawJobApplied(userId: string, jobAppliedId: string) {
		const jobApplied = await infra.candidateRepository.getJobApplied(userId, jobAppliedId)
		if (!jobApplied) {
			throw new BadRequestError('Entrevista não encontrada')
		}
		return jobApplied
	}

	return {
		async getTranslatedResult(params: {
			userId: string
			jobAppliedId: string
			company: Company & { id: string }
			language: string
			requestId?: string | null
		}): Promise<TranslationCacheResult> {
			const language = normalizeTranslationLanguage(params.language)
			await assertVisible(params)
			const jobApplied = await getRawJobApplied(params.userId, params.jobAppliedId)
			const sourceLanguage = await resolveSourceLanguage({
				infra,
				companyId: params.company.id,
				jobApplied,
			})
			const originalPayload = buildResultPayload(jobApplied)

			/*
			 * Cache incompleto conta como miss.
			 *
			 * O payload cresce com o tempo (a autenticidade entrou depois), e uma
			 * entrevista traduzida na versão anterior tem cache sem esse bloco.
			 * Devolver esse cache deixava metade da tela em inglês para sempre,
			 * porque a chave do idioma já existia e nada mais era gerado.
			 */
			const cached = jobApplied.interview?.translationCache?.[language] as
				| (InterviewResultTranslation & { translationVersion?: number })
				| undefined
			const stale = (cached?.translationVersion ?? 1) < TRANSLATION_PAYLOAD_VERSION
			if (cached && !stale) {
				return { language, sourceLanguage, cached: true, result: cached }
			}
			if (language === sourceLanguage) {
				return { language, sourceLanguage, cached: true, result: originalPayload }
			}

			const response = await translateJson<InterviewResultTranslation>({
				payload: originalPayload,
				targetLanguage: language,
				sourceLanguage,
				instructions: 'Recruiting score numbers and evaluation levels must not change.',
			})
			const translatedResult = {
				...mergeTranslatedResult(originalPayload, response.translated),
				translationVersion: TRANSLATION_PAYLOAD_VERSION,
			}

			await infra.candidateRepository.updateJobAppliedInTransaction(
				params.userId,
				params.jobAppliedId,
				(current) => ({
					'interview.translationCache': {
						...(current.interview?.translationCache ?? {}),
						[language]: translatedResult,
					},
				}),
			)

			recordCoreAiUsage({
				infra,
				company: params.company,
				userId: params.userId,
				requestId: params.requestId ?? null,
				surface: 'translate',
				model: response.model,
				provider: response.provider,
				usage: response.usage,
				jobAppliedId: params.jobAppliedId,
				metadata: {
					kind: 'result',
					targetLanguage: language,
					sourceLanguage,
				},
			})

			return { language, sourceLanguage, cached: false, result: translatedResult }
		},

		async getCaptionVtt(params: {
			userId: string
			jobAppliedId: string
			questionId: string
			company: Company & { id: string }
			language: string
			requestId?: string | null
		}): Promise<CaptionVttResult> {
			const language = normalizeTranslationLanguage(params.language)
			await assertVisible(params)
			const jobApplied = await getRawJobApplied(params.userId, params.jobAppliedId)
			const sourceLanguage = await resolveSourceLanguage({
				infra,
				companyId: params.company.id,
				jobApplied,
			})
			const question = jobApplied.interview?.info?.find((item) => item.id === params.questionId) as InterviewInfoItem | undefined
			const segments = question?.captionSegments ?? null

			if (!question || !segments || segments.length === 0) {
				throw new BadRequestError('Segmentos de legenda não encontrados')
			}

			if (language === sourceLanguage) {
				return { language, sourceLanguage, cached: true, vtt: buildWebVtt(segments) }
			}

			const cached = question.captionTranslations?.[language]
			if (cached && cached.length > 0) {
				return { language, sourceLanguage, cached: true, vtt: buildWebVtt(cached) }
			}

			const response = await translateJson<{ segments: Array<{ index: number; text: string }> }>({
				payload: {
					segments: segments.map((segment, index) => ({ index, text: segment.text })),
				},
				targetLanguage: language,
				sourceLanguage,
				instructions: 'Caption text may be short speech fragments. Preserve segment indexes exactly.',
			})
			const translatedSegments = mergeTranslatedSegments(segments, response.translated)

			await infra.candidateRepository.updateJobAppliedInTransaction(
				params.userId,
				params.jobAppliedId,
				(current) => {
					const info = (current.interview?.info ?? []).map((item) => {
						if (item.id !== params.questionId) return item
						return {
							...item,
							captionTranslations: {
								...(item.captionTranslations ?? {}),
								[language]: translatedSegments,
							},
						}
					})
					return { 'interview.info': info }
				},
			)

			recordCoreAiUsage({
				infra,
				company: params.company,
				userId: params.userId,
				requestId: params.requestId ?? null,
				surface: 'translate',
				model: response.model,
				provider: response.provider,
				usage: response.usage,
				jobAppliedId: params.jobAppliedId,
				metadata: {
					kind: 'caption_vtt',
					targetLanguage: language,
					sourceLanguage,
					questionId: params.questionId,
				},
			})

			return { language, sourceLanguage, cached: false, vtt: buildWebVtt(translatedSegments) }
		},
	}
}
