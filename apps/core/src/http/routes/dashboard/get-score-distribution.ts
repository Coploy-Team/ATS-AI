import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createDashboardService } from '@/lib/services/dashboard-service'
import { createDashboardScoreVisibility } from '@/lib/services/dashboard-score-visibility'
import type { CompanyInterview, UsersCompany } from '@coploy/domain'

const BUCKETS = [
	{ key: '0-2', min: 0, max: 2 },
	{ key: '2-4', min: 2, max: 4 },
	{ key: '4-6', min: 4, max: 6 },
	{ key: '6-8', min: 6, max: 8 },
	{ key: '8-10', min: 8, max: 10.0001 }, // include 10
] as const

function getMonthDateRange(month?: number, year?: number) {
	const now = new Date()
	const m = month && month >= 1 && month <= 12 ? month - 1 : now.getMonth()
	const y = year ?? now.getFullYear()
	const startOfMonth = new Date(y, m, 1)
	const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999)
	return { startOfMonth, endOfMonth }
}

function parseScore(raw: unknown): number | null {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw
	if (typeof raw === 'string') {
		const n = Number.parseFloat(raw)
		return Number.isFinite(n) ? n : null
	}
	return null
}

export function getScoreDistribution(app: FastifyInstance) {
	const dashboardService = createDashboardService(app.infra)
	const scoreVisibility = createDashboardScoreVisibility(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/dashboard/score-distribution',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary: 'Distribuição de scores das entrevistas no mês',
					body: z.object({
						uidCompany: z.string().optional(),
						month: z.number().int().min(1).max(12).optional(),
						year: z.number().int().min(2000).optional(),
					}),
					response: {
						200: z.object({
							buckets: z.array(
								z.object({
									key: z.string(),
									count: z.number(),
								}),
							),
							totalScored: z.number(),
							avgScore: z.number().nullable(),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const user = (await dashboardService.getUsersCompany(userId)) as UsersCompany | null
				if (!user?.company?.id) {
					throw new BadRequestError('User or company not found')
				}

				const { uidCompany, month, year } = request.body as {
					uidCompany?: string
					month?: number
					year?: number
				}
				const companyId = uidCompany || user.company.id
				const { startOfMonth, endOfMonth } = getMonthDateRange(month, year)

				const interviews = (await dashboardService.listCompanyInterviews(companyId, {
					filters: [
						{ field: 'date', operator: '>=', value: startOfMonth },
						{ field: 'date', operator: '<=', value: endOfMonth },
						{ field: 'finished', operator: '==', value: true },
					],
				})) as CompanyInterview[]

				/*
				 * Só entra na estatística a nota que o cliente já pode ver. Média e
				 * distribuição são o mesmo dado do dossiê por outro caminho — com
				 * um candidato na base, a "média" É a nota bloqueada.
				 */
				const visiveis = await scoreVisibility.filterVisibleScores(companyId, interviews)

				const counts = new Map<string, number>(BUCKETS.map((b) => [b.key, 0]))
				let totalScored = 0
				let scoreSum = 0

				for (const interview of visiveis) {
					const score = parseScore(interview.score)
					if (score === null) continue
					totalScored++
					scoreSum += score
					const bucket = BUCKETS.find((b) => score >= b.min && score < b.max)
					if (bucket) {
						counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1)
					}
				}

				return {
					buckets: BUCKETS.map((b) => ({ key: b.key, count: counts.get(b.key) ?? 0 })),
					totalScored,
					avgScore: totalScored > 0 ? scoreSum / totalScored : null,
				}
			},
		)
}
