import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'

import type { CompanyInterview, UsersCompany } from '@coploy/domain'
import { createDashboardService } from '@/lib/services/dashboard-service'

// Helper function to convert a date value to Brazil timezone (UTC-3).
// Accepts Date objects or Timestamp-like shapes { seconds, toDate? } from any source.
function toBrazilTime(value: unknown): Date {
	let utcDate: Date
	if (value instanceof Date) {
		utcDate = value
	} else if (value != null && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
		utcDate = (value as { toDate: () => Date }).toDate()
	} else if (value != null && typeof value === 'object' && typeof (value as { seconds?: unknown }).seconds === 'number') {
		utcDate = new Date((value as { seconds: number }).seconds * 1000)
	} else {
		utcDate = new Date(value as never)
	}

	const BRAZIL_OFFSET_HOURS = -3
	return new Date(utcDate.getTime() + BRAZIL_OFFSET_HOURS * 60 * 60 * 1000)
}

// Define time slots
const TIME_SLOTS = [
	{ name: 'Madrugada (0h-6h)', start: 0, end: 6 },
	{ name: 'Manhã (6h-12h)', start: 6, end: 12 },
	{ name: 'Tarde (12h-18h)', start: 12, end: 18 },
	{ name: 'Noite (18h-24h)', start: 18, end: 24 },
]

// Cache system
type CacheEntry = {
	data: {
		result: Array<{
			faixa: string
			'Dia Útil': number
			'Fim de Semana': number
		}>
		timestamp: number
		expiresAt: number
	}
	timestamp: number
	expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds

// Helper function to get cache key
function getCacheKey(companyId: string, startDate: Date): string {
	const weekStart = startDate.toISOString().split('T')[0] // YYYY-MM-DD format
	return `interviews-by-time:${companyId}:${weekStart}`
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

// Helper function to check if a date is a weekend
function isWeekend(date: Date): boolean {
	const day = date.getDay()
	return day === 0 || day === 6 // 0 is Sunday, 6 is Saturday
}

// Helper function to get time slot for a given hour
function getTimeSlot(hour: number): string {
	const slot = TIME_SLOTS.find(
		(timeSlot) => hour >= timeSlot.start && hour < timeSlot.end,
	)
	return slot ? slot.name : TIME_SLOTS[0].name // Default to first slot if somehow out of range
}

// Helper function to get week date range
function getWeekDateRange() {
	const now = new Date()
	const currentDay = now.getDay() // 0 = Sunday, 6 = Saturday

	// Calculate the start of the week (last Sunday)
	const startDate = new Date(now)
	startDate.setDate(now.getDate() - currentDay) // Go back to last Sunday
	startDate.setHours(0, 0, 0, 0) // Set to start of day

	// Calculate the end of the week (next Saturday)
	const endDate = new Date(startDate)
	endDate.setDate(startDate.getDate() + 6) // Add 6 days to get to Saturday
	endDate.setHours(23, 59, 59, 999) // Set to end of day

	return { startDate, endDate }
}

type DashboardService = ReturnType<typeof createDashboardService>

// Optimized function to fetch interviews data
async function fetchInterviewsData(
	dashboardService: DashboardService,
	companyId: string,
	startDate: Date,
	endDate: Date,
) {
	// Initialize statistics object
	const stats = TIME_SLOTS.reduce(
		(acc, slot) => {
			acc[slot.name] = {
				'Dia Útil': 0,
				'Fim de Semana': 0,
			}
			return acc
		},
		{} as Record<string, { 'Dia Útil': number; 'Fim de Semana': number }>,
	)

	// Get all interviews for the company in the week with filters
	const interviews = await dashboardService.listCompanyInterviews(
		companyId,
		{
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
	// Process interviews
	for (const interview of interviews) {
		if (!interview.date) {
			continue
		}

		// Convert to Brazil timezone to ensure consistency across environments
		const interviewDate = toBrazilTime(interview.date)
		const hour = interviewDate.getHours()
		const timeSlot = getTimeSlot(hour)
		const isWeekendDay = isWeekend(interviewDate)

		// Increment the appropriate counter
		if (isWeekendDay) {
			stats[timeSlot]['Fim de Semana']++
		} else {
			stats[timeSlot]['Dia Útil']++
		}
	}

	// Convert stats object to array format
	const result = TIME_SLOTS.map((slot) => ({
		faixa: slot.name,
		'Dia Útil': stats[slot.name]['Dia Útil'],
		'Fim de Semana': stats[slot.name]['Fim de Semana'],
	}))

	return result
}

export function getInterviewsByTime(app: FastifyInstance) {
	const dashboardService = createDashboardService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/dashboard/interviews-by-time',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary:
						'Get interview statistics by time slots for the current week (Sunday to Saturday)',
					description:
						'Retorna estatísticas de entrevistas agrupadas por faixa de horário para a semana atual (domingo a sábado). O parâmetro uidCompany é opcional. Se não for fornecido, serão retornados os dados da empresa do usuário autenticado. Dados são cacheados por 1 hora. IMPORTANTE: Todas as datas são processadas no timezone do Brasil (UTC-3) para garantir consistência entre diferentes ambientes.',
					body: z.object({
						uidCompany: z
							.string()
							.optional()
							.describe(
								'ID da empresa. Se não fornecido, usa a empresa do usuário logado. Exemplo: pEzWHatURiTVb76FZaLZ',
							),
					}),
					response: {
						200: z
							.array(
								z.object({
									faixa: z
										.string()
										.describe(
											'Faixa de horário da entrevista (Madrugada, Manhã, Tarde ou Noite)',
										),
									'Dia Útil': z
										.number()
										.describe(
											'Quantidade de entrevistas em dias úteis (segunda a sexta)',
										),
									'Fim de Semana': z
										.number()
										.describe(
											'Quantidade de entrevistas em finais de semana (sábado e domingo)',
										),
								}),
							)
							.describe(`
              Exemplo de uso:
              POST /dashboard/interviews-by-time
              Body: { "uidCompany": "pEzWHatURiTVb76FZaLZ" } - Retorna dados da empresa especificada
              Body: {} - Retorna dados da empresa do usuário logado
              
              Faixas de horário:
              - Madrugada (0h-6h)
              - Manhã (6h-12h)
              - Tarde (12h-18h)
              - Noite (18h-24h)
              
              IMPORTANTE: Todas as horas são calculadas no timezone do Brasil (UTC-3).
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

				// Get company ID from body or use user's company
				const { uidCompany } = request.body as { uidCompany?: string }
				const companyId = uidCompany || user.company!.id

				// Calculate date range for current week
				const { startDate, endDate } = getWeekDateRange()
				const cacheKey = getCacheKey(companyId, startDate)

				// Check cache first
				const cachedData = getCachedData(cacheKey)
				if (cachedData) {
					return cachedData.result
				}

				// Fetch fresh data
				const result = await fetchInterviewsData(
					dashboardService,
					companyId,
					startDate,
					endDate,
				)

				// Cache the result
				const cacheEntry = {
					result,
					timestamp: Date.now(),
					expiresAt: Date.now() + CACHE_TTL,
				}
				setCachedData(cacheKey, cacheEntry)

				return result
			},
		)
}
