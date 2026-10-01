import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import { env } from '@/env'
import {
	buildSystemPrompt,
	FALLBACK_MESSAGES,
	getStandardResponseWithApiKey,
	getStandardResponseWithoutApiKey,
	INSIGHTS_CONFIG,
	INTERNAL_ENDPOINTS,
	NO_API_KEY_RESPONSES,
	STANDARD_RESPONSES,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from '@/http/constants/insights-constants'
import { BadRequestError } from '@coploy/shared/errors'
import type { InfraProvider } from '@coploy/infra'
import {
	INSIGHT_OPENAI_CONFIG,
	INSIGHT_SYSTEM_PROMPT,
	INSIGHT_USER_PROMPT,
} from '@/lib/prompts/dashboard'
import { toDate } from '@/lib/date-formatter'
import type {
	InsightCache,
	InsightGenerationParams,
	InsightResult,
	InsightSourceData,
	PromptData,
} from '@/types/insights'

// Texts written by the fallback path (no data / no api key). If a cache
// entry happens to equal one of these (e.g. saved earlier in the day before
// the fix that stopped persisting them), treat it as "no usable cache" so
// the next request re-evaluates against fresh data.
const FALLBACK_INSIGHT_TEXTS = new Set<string>([
	...Object.values(STANDARD_RESPONSES),
	...Object.values(NO_API_KEY_RESPONSES),
])

function generatedAtMs(insight: InsightCache): number {
	const raw = insight.generatedAt
	if (!raw) return 0
	if (raw instanceof Date) return raw.getTime()
	const date = new Date(raw as unknown as string | number)
	const ms = date.getTime()
	return Number.isFinite(ms) ? ms : 0
}

// Verificar se insights já foram gerados hoje. Quando há múltiplas
// entradas pro mesmo idioma (ex: usuário clicou Atualizar e gerou de
// novo), retorna a MAIS RECENTE — caso contrário um refresh some
// quando a página recarrega.
export function findCachedInsight(
	cache: InsightCache[],
	language: SupportedLanguage,
): InsightCache | undefined {
	const candidates = cache.filter(
		(insight) =>
			insight.language === language &&
			typeof insight.insight === 'string' &&
			!FALLBACK_INSIGHT_TEXTS.has(insight.insight),
	)
	if (candidates.length === 0) return undefined
	return candidates.sort((a, b) => generatedAtMs(b) - generatedAtMs(a))[0]
}

// Fazer chamada interna para um endpoint
async function makeInternalCall(
	app: FastifyInstance,
	endpoint: string,
	authorization: string,
	payload?: Record<string, unknown>,
): Promise<any> {
	const response = await app.inject({
		method: payload ? 'POST' : 'GET',
		url: endpoint,
		headers: { Authorization: authorization },
		...(payload && { payload }),
	})

	if (response.statusCode !== 200) {
		throw new BadRequestError(`Erro ao obter dados de ${endpoint}`)
	}

	return JSON.parse(response.body)
}

// Buscar todos os dados necessários dos endpoints internos
export async function fetchInsightSourceData(
	app: FastifyInstance,
	companyId: string,
	authorization: string,
): Promise<InsightSourceData> {
	const [interviewsByJob, interviewsByTime, homeData] = await Promise.all([
		makeInternalCall(app, INTERNAL_ENDPOINTS.INTERVIEWS_BY_JOB, authorization, {
			uidCompany: companyId,
		}),
		makeInternalCall(
			app,
			INTERNAL_ENDPOINTS.INTERVIEWS_BY_TIME,
			authorization,
			{
				uidCompany: companyId,
			},
		),
		makeInternalCall(app, INTERNAL_ENDPOINTS.DASHBOARD_HOME, authorization),
	])

	return {
		interviewsByJob,
		interviewsByTime,
		homeData,
	}
}

// Calcular total de entrevistas
export function calculateTotalInterviews(
	interviewsByJob: Array<{ value: number }>,
): number {
	return interviewsByJob.reduce(
		(sum: number, job: { value: number }) => sum + job.value,
		0,
	)
}

// Verificar se há dados suficientes
export function hassufficientData(totalInterviews: number): boolean {
	return totalInterviews > INSIGHTS_CONFIG.MIN_INTERVIEWS_REQUIRED
}

// Verificar se há API key da OpenAI
export function hasOpenAIKey(): boolean {
	return Boolean(env.OPENAI_API_KEY)
}

// Preparar dados para o prompt da OpenAI
export function preparePromptData(sourceData: InsightSourceData): PromptData {
	const { interviewsByJob, interviewsByTime, homeData } = sourceData

	return {
		interviewsByJob,
		interviewsByTime,
		dashboard: {
			jobs: {
				total: homeData.jobs.total,
				items: homeData.jobs.items.length,
			},
			interviews: {
				total: homeData.interviews.total,
				items: homeData.interviews.items.length,
			},
			approved: {
				total: homeData.approved.total,
				items: homeData.approved.items.length,
			},
			approvalRate:
				homeData.interviews.total > 0
					? `${(
							(homeData.approved.total / homeData.interviews.total) * 100
						).toFixed(1)}%`
					: '0%',
		},
	}
}

// Gerar insight para um idioma específico usando OpenAI
async function generateInsightForLanguage(
	language: SupportedLanguage,
	promptData: PromptData,
): Promise<string> {
	const userPrompt = INSIGHT_USER_PROMPT.replace(
		'{{data}}',
		JSON.stringify(promptData),
	)

	const systemPromptWithLanguage = buildSystemPrompt(
		language,
		INSIGHT_SYSTEM_PROMPT,
	)

	const openaiResponse = await axios.post(
		'https://api.openai.com/v1/chat/completions',
		{
			...INSIGHT_OPENAI_CONFIG,
			messages: [
				{ role: 'system', content: systemPromptWithLanguage },
				{ role: 'user', content: userPrompt },
			],
		},
		{
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
			},
		},
	)

	return openaiResponse.data.choices[0].message.content.trim()
}

export function createInsightsService(infra: InfraProvider) {
	// Buscar cache de insights existente para hoje
	async function fetchTodaysInsightCache(
		companyId: string,
	): Promise<InsightCache[]> {
		const today = new Date()
		today.setHours(0, 0, 0, 0) // Define para o início do dia
		const todayTimestamp = new Date(today)

		return await infra.companyRepository.listInsightsCache(companyId, {
			filters: [
				{
					field: 'generatedAt',
					operator: '>=',
					value: todayTimestamp,
				},
			],
		}) as InsightCache[]
	}

	// Salvar insight no cache
	async function saveInsightToCache(
		companyId: string,
		language: SupportedLanguage,
		insight: string,
		timestamp: Date,
		sampleSize?: { interviews: number; jobs: number },
	): Promise<void> {
		await infra.companyRepository.createInsightsCache(companyId, {
			language,
			insight,
			generatedAt: timestamp,
			...(sampleSize && {
				sampleSizeInterviews: sampleSize.interviews,
				sampleSizeJobs: sampleSize.jobs,
			}),
		})
	}

	// Salvar respostas padrão para todos os idiomas
	async function saveStandardResponses(
		companyId: string,
		hasApiKey: boolean,
	): Promise<Record<SupportedLanguage, string>> {
		const currentTime = new Date()
		const responses: Record<SupportedLanguage, string> = {} as Record<
			SupportedLanguage,
			string
		>

		const savePromises = SUPPORTED_LANGUAGES.map(async (lang) => {
			const response = hasApiKey
				? getStandardResponseWithApiKey(lang)
				: getStandardResponseWithoutApiKey(lang)
			responses[lang] = response

			await saveInsightToCache(companyId, lang, response, currentTime)
		})

		await Promise.all(savePromises)
		return responses
	}

	// Gerar insights usando OpenAI para todos os idiomas
	async function generateAllInsights(
		companyId: string,
		promptData: PromptData,
		sampleSize?: { interviews: number; jobs: number },
	): Promise<Record<SupportedLanguage, string>> {
		const generatedInsights: Record<SupportedLanguage, string> = {} as Record<
			SupportedLanguage,
			string
		>
		const currentTime = new Date()

		const generatePromises = SUPPORTED_LANGUAGES.map(async (lang) => {
			try {
				const insightText = await generateInsightForLanguage(lang, promptData)
				generatedInsights[lang] = insightText

				await saveInsightToCache(companyId, lang, insightText, currentTime, sampleSize)
			} catch {
				// Em caso de erro, usamos uma mensagem de fallback
				const fallbackMessage = FALLBACK_MESSAGES[lang]
				generatedInsights[lang] = fallbackMessage

				await saveInsightToCache(companyId, lang, fallbackMessage, currentTime, sampleSize)
			}
		})

		await Promise.all(generatePromises)
		return generatedInsights
	}

	return {
		fetchTodaysInsightCache,
		saveStandardResponses,
		generateAllInsights,

		// Função principal para processar insights
		async processInsights(
			params: InsightGenerationParams,
			app: FastifyInstance,
		): Promise<InsightResult> {
			const { companyId, language, authorization, force } = params

			// 1. Cache existente — pulado quando force=true (botão "atualizar agora")
			if (!force) {
				const existingCache = await fetchTodaysInsightCache(companyId)
				const cachedInsight = findCachedInsight(existingCache, language)

				if (cachedInsight) {
					const cachedAny = cachedInsight as InsightCache & {
						sampleSizeInterviews?: number
						sampleSizeJobs?: number
					}
					const cachedSample =
						typeof cachedAny.sampleSizeInterviews === 'number' &&
						typeof cachedAny.sampleSizeJobs === 'number'
							? {
									interviews: cachedAny.sampleSizeInterviews,
									jobs: cachedAny.sampleSizeJobs,
								}
							: undefined
					return {
						insight: cachedInsight.insight,
						generatedAt:
							toDate(cachedInsight.generatedAt)?.toISOString() ?? new Date().toISOString(),
						language: cachedInsight.language,
						...(cachedSample && { sampleSize: cachedSample }),
					}
				}
			}

			// 2. Buscar dados necessários
			const sourceData = await fetchInsightSourceData(app, companyId, authorization)
			const totalInterviews = calculateTotalInterviews(sourceData.interviewsByJob)
			const totalJobs = sourceData.homeData?.jobs?.items?.length ?? 0
			const sampleSize = { interviews: totalInterviews, jobs: totalJobs }

			// 3. Verificar se temos dados suficientes e configuração
			const hasSufficientData = hassufficientData(totalInterviews)
			const hasApiKeyAvailable = hasOpenAIKey()

			if (!hasSufficientData || !hasApiKeyAvailable) {
				// Don't cache the "no data" / "no API key" fallback responses —
				// otherwise once data becomes available later in the day the
				// stale fallback keeps being served until midnight. Only real
				// generations (the path below) are worth caching.
				const fallback = hasApiKeyAvailable
					? getStandardResponseWithApiKey(language)
					: getStandardResponseWithoutApiKey(language)
				return {
					insight: fallback,
					generatedAt: new Date().toISOString(),
					language,
					sampleSize,
				}
			}

			// 4. Gerar insights usando OpenAI
			const promptData = preparePromptData(sourceData)
			const generatedInsights = await generateAllInsights(companyId, promptData, sampleSize)

			return {
				insight: generatedInsights[language],
				generatedAt: new Date().toISOString(),
				language,
				sampleSize,
			}
		},
	}
}

