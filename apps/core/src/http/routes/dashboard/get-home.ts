import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { isSelfHosted } from '@coploy/shared/env'

import { dashboardHomeResponseSchema, dashboardHomeSchema } from '@/schemas/dashboard'
import type { CompanyInterview, PostJob } from '@coploy/domain'
import { createAuth } from '../middlewares/auth'
import { toDate } from '@/lib/date-formatter'
import { createDashboardService } from '@/lib/services/dashboard-service'
import { createDashboardScoreVisibility } from '@/lib/services/dashboard-score-visibility'

// Cache system
type CacheEntry = {
	data: {
		jobs: {
			total: number
			items: Array<{
				id: string
				jobId: string
				jobName: string
				timeCreated: Date | null
				typeInterview: string
			}>
		}
		interviews: {
			total: number
			items: Array<{
				id: string
				name: string
				date: Date | null
				dateSelect: Date | null
				finished: boolean
				typeInterview: string
			}>
		}
		approved: {
			total: number
			items: Array<{
				id: string
				name: string
				date: Date | null
				dateSelect: Date | null
				finished: boolean
				typeInterview: string
			}>
		}
		scoreAvg: {
			value: number
			sampleSize: number
		}
	}
	timestamp: number
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds

// Helper function to get cache key
function getCacheKey(companyId: string, month: number, year: number): string {
	return `dashboard-home:${companyId}:${year}-${month.toString().padStart(2, '0')}`
}

// Helper function to get cached data
function getCachedData(key: string): CacheEntry['data'] | null {
	const entry = cache.get(key)
	if (!entry) {
		return null
	}

	if (Date.now() > entry.expiresAt) {
		cache.delete(key)
		return null
	}

	return entry.data
}

// Helper function to set cached data
function setCachedData(key: string, data: CacheEntry['data']): void {
	const now = Date.now()
	cache.set(key, {
		data,
		timestamp: now,
		expiresAt: now + CACHE_TTL,
	})
}

// Helper function to clean expired cache entries
function cleanExpiredCache(): void {
	const now = Date.now()
	for (const [key, entry] of cache.entries()) {
		if (now > entry.expiresAt) {
			cache.delete(key)
		}
	}
}

export function getHome(app: FastifyInstance) {
	const dashboardSvc = createDashboardService(app.infra)
	const scoreVisibility = createDashboardScoreVisibility(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/dashboard/home',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary: 'Get home dashboard',
					querystring: dashboardHomeSchema,
					response: {
						200: dashboardHomeResponseSchema,
					},
				},
			},
			async (request) => {
				const { month: queryMonth, year: queryYear } =
					dashboardHomeSchema.parse(request.query)

				const now = new Date()
				const month = queryMonth ?? now.getMonth() + 1
				const year = queryYear ?? now.getFullYear()

				const { company } = await request.getUserMembership()

				// Clean expired cache entries
				cleanExpiredCache()

				// Generate cache key
				const cacheKey = getCacheKey(company.id, month, year)
				const cacheEnabled = !isSelfHosted()

				// Try to get cached data first
				if (cacheEnabled) {
					const cachedData = getCachedData(cacheKey)
					if (cachedData) {
						return cachedData
					}
				}

				const startOfMonth = new Date(year, month - 1, 1)
				const endOfMonth = new Date(
					year,
					month,
					0,
					23,
					59,
					59,
				)

				const companyId = company.id
				// Busca jobs do mês
				const jobs = (await dashboardSvc.listJobs(companyId, {
					filters: [
						{
							field: 'timeCreated',
							operator: '>=',
							value: startOfMonth,
						},
						{
							field: 'timeCreated',
							operator: '<=',
							value: endOfMonth,
						},
					],
				})) as PostJob[]

				// Busca entrevistas do mês
				const interviews = (await dashboardSvc.listCompanyInterviews(
					companyId,
					{
						filters: [
							{
								field: 'date',
								operator: '>=',
								value: startOfMonth,
							},
							{
								field: 'date',
								operator: '<=',
								value: endOfMonth,
							},
							{
								field: 'finished',
								operator: '==',
								value: true,
							},
						],
					},
				)) as CompanyInterview[]

				// Aprovados — entrevistas do mês que estão com candidateStatus
				// = Approved. Filtra pelo campo `date` (data da entrevista),
				// igual ao card de Entrevistas. Coerência: "destas entrevistas
				// do mês, X foram aprovadas". Antes usávamos `date_select`
				// (data da decisão), o que criava inconsistência com o resto
				// dos KPIs (ver discussão no ConversionFunnel).
				const approved = interviews.filter(
					(i) => i.candidateStatus === 'Approved',
				)

				// Score médio das entrevistas finalizadas no mês — só conta
				// score > 0 (entrevistas sem pontuação não são "ruim", são
				// "não pontuadas" e enviesariam a média pra baixo).
				const interviewsWithScore = interviews.filter((i) => {
					const raw = i.score
					const num =
						typeof raw === 'number'
							? raw
							: typeof raw === 'string'
								? Number.parseFloat(raw)
								: 0
					return Number.isFinite(num) && num > 0
				})
				const scoreSum = interviewsWithScore.reduce((sum, i) => {
					const raw = i.score
					const num =
						typeof raw === 'number'
							? raw
							: typeof raw === 'string'
								? Number.parseFloat(raw)
								: 0
					return sum + num
				}, 0)
				const scoreAvgValue =
					interviewsWithScore.length > 0
						? scoreSum / interviewsWithScore.length
						: 0

				const response = {
					jobs: {
						total: jobs.length,
						items: jobs.map((job) => ({
							id: job.id,
							jobId: job.jobId ?? '',
							jobName: job.jobName ?? '',
							timeCreated: toDate(job?.timeCreated),
							typeInterview: job?.typeInterview ?? '',
						})),
					},
					interviews: {
						total: interviews.length,
						items: interviews.map((interview) => ({
							id: interview.id,
							name: interview.name ?? '',
							date: toDate(interview?.date),
							dateSelect: toDate(interview?.dateSelect),
							finished: interview?.finish ?? false,
							typeInterview: interview?.typeInterview ?? '',
						})),
					},
					approved: {
						total: approved.length,
						items: approved.map((interview: CompanyInterview) => ({
							id: interview.id,
							name: interview.name ?? '',
							date: toDate(interview?.date),
							dateSelect: toDate(interview?.dateSelect),
							finished: interview.finish ?? false,
							typeInterview: interview.typeInterview ?? '',
						})),
					},
					scoreAvg: {
						value: scoreAvgValue,
						sampleSize: interviewsWithScore.length,
					},
				}

				// Cache the response data (GCP only).
				if (cacheEnabled) {
					setCachedData(cacheKey, response)
				}

				return response
			},
		)
}
