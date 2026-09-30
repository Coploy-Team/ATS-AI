import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'

import type { CompanyInterview, UsersCompany } from '@coploy/domain'
import { createDashboardService } from '@/lib/services/dashboard-service'
import { dashboardScope } from '@/lib/access-scope'

// Cache system
type CacheEntry = {
	data: Array<{ name: string; value: number }>
	timestamp: number
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds

// Helper function to get cache key
function getCacheKey(companyId: string, month: string): string {
	return `interviews-by-job:${companyId}:${month}`
}

// Helper function to get cached data
function getCachedData(
	key: string,
): Array<{ name: string; value: number }> | null {
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
function setCachedData(
	key: string,
	data: Array<{ name: string; value: number }>,
): void {
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

// Helper function to get month date range. When `month` (1-12) and `year`
// are passed, builds the range for that month; otherwise defaults to the
// current month so existing callers don't change behavior.
function getMonthDateRange(month?: number, year?: number) {
	const now = new Date()
	const m = month && month >= 1 && month <= 12 ? month - 1 : now.getMonth()
	const y = year ?? now.getFullYear()
	const startOfMonth = new Date(y, m, 1)
	const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999)
	return { startOfMonth, endOfMonth }
}

type DashboardService = ReturnType<typeof createDashboardService>

// Optimized function to fetch interviews by job data
async function fetchInterviewsByJobData(
	dashboardService: DashboardService,
	companyId: string,
	/** Vagas alcançadas pela sessão; `null` = todas. */
	jobIdsInScope: Set<string> | null,
	startDate: Date,
	endDate: Date,
) {
	// Get all interviews for the company in the month with filters
	const interviews = await dashboardService.listCompanyInterviews(
		companyId,
		{
			jobIdsInScope,
			filters: [
				{
					field: 'date',
					operator: '>=',
					value: startDate,
				},
				{
					field: 'date',
					operator: '<=',
					value: endDate,
				},
				{
					field: 'finished',
					operator: '==',
					value: true,
				},
			],
			orderByField: 'date',
			orderDirection: 'desc',
		},
	) as CompanyInterview[]

	// Group interviews by job name and count
	const jobCounts = new Map<string, number>()

	for (const interview of interviews) {
		if (interview.jobName) {
			const currentCount = jobCounts.get(interview.jobName) || 0
			jobCounts.set(interview.jobName, currentCount + 1)
		}
	}

	// Convert to result array
	const result: { name: string; value: number }[] = Array.from(
		jobCounts.entries(),
	).map(([name, value]) => ({ name, value }))

	// Sort from highest to lowest and get top 20
	result.sort((a, b) => b.value - a.value)
	const top20Result = result.slice(0, 20)

	return top20Result
}

export function getInterviewsByJob(app: FastifyInstance) {
	const dashboardService = createDashboardService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/dashboard/interviews-by-job',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary: 'Get interview count by job for the current month',
					description:
						'Retorna a quantidade de entrevistas por vaga (jobName) no mês atual. O parâmetro uidCompany é opcional. Se não for fornecido, serão retornados os dados da empresa do usuário autenticado. Dados são cacheados por 1 hora.',
					body: z.object({
						uidCompany: z
							.string()
							.optional()
							.describe(
								'ID da empresa. Se não fornecido, usa a empresa do usuário logado.',
							),
						month: z
							.number()
							.int()
							.min(1)
							.max(12)
							.optional()
							.describe('Mês (1-12). Default = mês atual.'),
						year: z
							.number()
							.int()
							.min(2000)
							.optional()
							.describe('Ano (ex: 2026). Default = ano atual.'),
					}),
					response: {
						200: z
							.array(
								z.object({
									name: z.string().describe('Nome da vaga (jobName)'),
									value: z
										.number()
										.describe(
											'Quantidade de entrevistas para a vaga no mês atual',
										),
								}),
							)
							.describe(`
              Exemplo de uso:
              POST /dashboard/interviews-by-job
              Body: { "uidCompany": "pEzWHatURiTVb76FZaLZ" } - Retorna dados da empresa especificada
              Body: {} - Retorna dados da empresa do usuário logado
              
              Nota: Os dados são cacheados por 1 hora para melhor performance.
            `),
					},
				},
			},
			async (request) => {
				// Clean expired cache entries periodically
				cleanExpiredCache()

				const userId = await request.getCurrentUser()
				const user = await dashboardService.getUsersCompany(userId) as UsersCompany | null
				if (!user) {
					throw new BadRequestError('User not found')
				}

				const { uidCompany, month, year } = request.body as {
					uidCompany?: string
					month?: number
					year?: number
				}
				const companyId = uidCompany || user.company!.id

				// Calculate date range for the requested (or current) month
				const { startOfMonth, endOfMonth } = getMonthDateRange(month, year)
				const monthKey = `${startOfMonth.getFullYear()}-${String(startOfMonth.getMonth() + 1).padStart(2, '0')}`
				// o alcance entra na chave: painel recortado não pode servir de
				// cache para quem enxerga a empresa inteira
				const alcance = await dashboardScope(app.infra, request, companyId)
				const cacheKey = `${getCacheKey(companyId, monthKey)}:${alcance.userId ?? 'todos'}`

				// Check cache first (bypassed temporarily while diagnosing empty result)
				const cachedData = getCachedData(cacheKey)
				if (cachedData && cachedData.length > 0) {
					return cachedData
				}

				// Fetch fresh data
				const result = await fetchInterviewsByJobData(
					dashboardService,
					companyId,
					alcance.jobIds,
					startOfMonth,
					endOfMonth,
				)

				// Cache the result
				setCachedData(cacheKey, result)

				return result
			},
		)
}
