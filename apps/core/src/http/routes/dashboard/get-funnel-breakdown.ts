import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createDashboardService } from '@/lib/services/dashboard-service'
import { dashboardScope } from '@/lib/access-scope'
import type { CompanyInterview, UsersCompany } from '@coploy/domain'

function getMonthDateRange(month?: number, year?: number) {
	const now = new Date()
	const m = month && month >= 1 && month <= 12 ? month - 1 : now.getMonth()
	const y = year ?? now.getFullYear()
	const startOfMonth = new Date(y, m, 1)
	const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999)
	return { startOfMonth, endOfMonth }
}

/**
 * Breakdown das entrevistas finalizadas no mês por candidate_status. Cobre
 * o funil completo do candidato (Pending → Selected → Approved | Rejected).
 */
export function getFunnelBreakdown(app: FastifyInstance) {
	const dashboardService = createDashboardService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/dashboard/funnel-breakdown',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary: 'Distribuição das entrevistas do mês por status do candidato',
					body: z.object({
						uidCompany: z.string().optional(),
						month: z.number().int().min(1).max(12).optional(),
						year: z.number().int().min(2000).optional(),
					}),
					response: {
						200: z.object({
							total: z.number(),
							pending: z.number(),
							selected: z.number(),
							approved: z.number(),
							rejected: z.number(),
							other: z.number(),
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
				// painel do recrutador conta só as vagas dele
				const alcance = await dashboardScope(app.infra, request, companyId)
				const { startOfMonth, endOfMonth } = getMonthDateRange(month, year)

				const interviews = (await dashboardService.listCompanyInterviews(companyId, {
					jobIdsInScope: alcance.jobIds,
					filters: [
						{ field: 'date', operator: '>=', value: startOfMonth },
						{ field: 'date', operator: '<=', value: endOfMonth },
						{ field: 'finished', operator: '==', value: true },
					],
				})) as CompanyInterview[]

				let pending = 0
				let selected = 0
				let approved = 0
				let rejected = 0
				let other = 0

				// Diagnóstico: amostra dos statuses "outros" pra investigar variações
				// (ex: minúsculo, com espaço, idioma diferente). Limitado a 5 valores
				// distintos pra não inflar o log.
				const otherStatusSamples = new Set<string>()

				for (const interview of interviews) {
					const raw = interview.candidateStatus
					// Normaliza pra suportar variações de case/whitespace que estavam
					// caindo em "other" (ex: "approved", "Pending ", "REJECTED").
					const normalized =
						typeof raw === 'string' ? raw.trim().toLowerCase() : raw
					switch (normalized) {
						case 'pending':
							pending++
							break
						case 'selected':
							selected++
							break
						case 'approved':
							approved++
							break
						case 'rejected':
							rejected++
							break
						case null:
						case undefined:
						case '':
							pending++ // sem status explícito = pendente por convenção do app
							break
						default:
							other++
							if (typeof raw === 'string' && otherStatusSamples.size < 5) {
								otherStatusSamples.add(raw)
							}
					}
				}

				if (other > 0) {
					console.warn(
						`[FunnelBreakdown] ${other} entrevista(s) com status fora dos buckets conhecidos`,
						{
							companyId,
							samples: Array.from(otherStatusSamples),
						},
					)
				}

				return {
					total: interviews.length,
					pending,
					selected,
					approved,
					rejected,
					other,
				}
			},
		)
}
