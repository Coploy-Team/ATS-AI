import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createDashboardService } from '@/lib/services/dashboard-service'
import type { CompanyInterview, PostJob, UsersCompany } from '@coploy/domain'

type CacheEntry = { data: PerformanceRow[]; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL = 30 * 60 * 1000 // 30 min

function getMonthDateRange(month?: number, year?: number) {
	const now = new Date()
	const m = month && month >= 1 && month <= 12 ? month - 1 : now.getMonth()
	const y = year ?? now.getFullYear()
	const startOfMonth = new Date(y, m, 1)
	const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999)
	return { startOfMonth, endOfMonth }
}

interface PerformanceRow {
	jobId: string | null
	jobName: string
	identifier: string | null
	typeInterview: string | null
	interviews: number
	avgScore: number | null
	approved: number
	approvalRate: number | null
	selected: number
	selectedRate: number | null
	pending: number
	pendingRate: number | null
	rejected: number
	rejectedRate: number | null
	daysOpen: number | null
	isStopped: boolean
}

function parseScore(raw: unknown): number | null {
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw
	if (typeof raw === 'string') {
		const n = Number.parseFloat(raw)
		return Number.isFinite(n) ? n : null
	}
	return null
}

function daysBetween(from: Date | null | undefined, to: Date): number | null {
	if (!from) return null
	const ms = to.getTime() - new Date(from).getTime()
	if (!Number.isFinite(ms) || ms < 0) return null
	return Math.floor(ms / (24 * 60 * 60 * 1000))
}

export function getJobsPerformance(app: FastifyInstance) {
	const dashboardService = createDashboardService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/dashboard/jobs-performance',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary: 'Performance por vaga (mensal)',
					description:
						'Retorna métricas por vaga no mês selecionado: nº entrevistas, score médio, aprovados, taxa de aprovação, dias em aberto e flag de parada.',
					body: z.object({
						uidCompany: z.string().optional(),
						month: z.number().int().min(1).max(12).optional(),
						year: z.number().int().min(2000).optional(),
					}),
					response: {
						200: z.array(
							z.object({
								jobId: z.string().nullable(),
								jobName: z.string(),
								identifier: z.string().nullable(),
								typeInterview: z.string().nullable(),
								interviews: z.number(),
								avgScore: z.number().nullable(),
								approved: z.number(),
								approvalRate: z.number().nullable(),
								selected: z.number(),
								selectedRate: z.number().nullable(),
								pending: z.number(),
								pendingRate: z.number().nullable(),
								rejected: z.number(),
								rejectedRate: z.number().nullable(),
								daysOpen: z.number().nullable(),
								isStopped: z.boolean(),
							}),
						),
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
				const monthKey = `${startOfMonth.getFullYear()}-${String(
					startOfMonth.getMonth() + 1,
				).padStart(2, '0')}`
				const cacheKey = `jobs-performance:${companyId}:${monthKey}`

				const hit = cache.get(cacheKey)
				if (hit && hit.expiresAt > Date.now() && hit.data.length > 0) {
					return hit.data
				}

				const [interviews, jobs] = await Promise.all([
					dashboardService.listCompanyInterviews(companyId, {
						filters: [
							{ field: 'date', operator: '>=', value: startOfMonth },
							{ field: 'date', operator: '<=', value: endOfMonth },
							{ field: 'finished', operator: '==', value: true },
						],
					}) as Promise<CompanyInterview[]>,
					dashboardService.listJobs(companyId, {}) as Promise<PostJob[]>,
				])

				// Index jobs by name (also keeps jobId reference when available).
				const jobByName = new Map<string, PostJob>()
				for (const job of jobs) {
					if (job.jobName) jobByName.set(job.jobName, job)
				}

				type Acc = {
					jobName: string
					jobId: string | null
					interviews: number
					approved: number
					selected: number
					pending: number
					rejected: number
					scoreSum: number
					scoreCount: number
				}
				const accByName = new Map<string, Acc>()

				for (const interview of interviews) {
					const name = interview.jobName ?? '(sem nome)'
					const acc = accByName.get(name) ?? {
						jobName: name,
						jobId: jobByName.get(name)?.id ?? null,
						interviews: 0,
						approved: 0,
						selected: 0,
						pending: 0,
						rejected: 0,
						scoreSum: 0,
						scoreCount: 0,
					}
					acc.interviews++
					// Status normalizado pra ser robusto a variações
					// (case, espaço extra). "Pendente" = sem decisão
					// tomada (Pending explícito OU vazio).
					const raw = interview.candidateStatus
					const status =
						typeof raw === 'string' ? raw.trim().toLowerCase() : null
					if (status === 'approved') acc.approved++
					else if (status === 'selected') acc.selected++
					else if (status === 'rejected') acc.rejected++
					else acc.pending++ // Pending explícito ou ausente
					const score = parseScore(interview.score)
					if (score !== null && score > 0) {
						acc.scoreSum += score
						acc.scoreCount++
					}
					accByName.set(name, acc)
				}

				const today = new Date()
				const rate = (n: number, total: number) =>
					total > 0 ? (n / total) * 100 : null
				const rows: PerformanceRow[] = Array.from(accByName.values()).map((a) => {
					const job = jobByName.get(a.jobName)
					return {
						jobId: a.jobId,
						jobName: a.jobName,
						identifier: job?.identifier ?? null,
						typeInterview: job?.typeInterview ?? null,
						interviews: a.interviews,
						avgScore: a.scoreCount > 0 ? a.scoreSum / a.scoreCount : null,
						approved: a.approved,
						approvalRate: rate(a.approved, a.interviews),
						selected: a.selected,
						selectedRate: rate(a.selected, a.interviews),
						pending: a.pending,
						pendingRate: rate(a.pending, a.interviews),
						rejected: a.rejected,
						rejectedRate: rate(a.rejected, a.interviews),
						daysOpen: daysBetween(job?.timeCreated ?? null, today),
						isStopped: Boolean(job?.stopped),
					}
				})

				rows.sort((a, b) => b.interviews - a.interviews)

				cache.set(cacheKey, { data: rows, expiresAt: Date.now() + CACHE_TTL })
				return rows
			},
		)
}
