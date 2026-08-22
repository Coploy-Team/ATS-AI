import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { DEFAULT_CANDIDATE_SOURCE } from '@coploy/domain'
import type { CompanyInterview, UsersCompany } from '@coploy/domain'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createDashboardService } from '@/lib/services/dashboard-service'

/**
 * Source-of-hire (V2-601, GAP 5).
 *
 * "De onde vêm os melhores" era a pergunta que o analytics não respondia: media
 * funil e tempo, mas não a origem. Aqui cada origem sai com volume, aprovação e
 * nota média — os três juntos, porque separados enganam. Um canal que traz 200
 * pessoas com nota 4 é pior que um que traz 10 com nota 8, e olhar só o volume
 * diria o contrário.
 *
 * Candidatura anterior ao campo conta como `direct` (default explícito) — o
 * corte histórico fica honesto sem backfill.
 */
export function getSourceBreakdown(app: FastifyInstance) {
	const dashboardService = createDashboardService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/dashboard/source-breakdown',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['dashboard'],
					security: [{ bearerAuth: [] }],
					summary: 'Volume, aprovação e nota média por origem do candidato',
					body: z.object({
						jobId: z.string().optional(),
						/** Janela em dias contada de hoje. Default 90. */
						days: z.number().int().min(1).max(730).optional(),
					}),
					response: {
						200: z.object({
							total: z.number(),
							sources: z.array(
								z.object({
									source: z.string(),
									total: z.number(),
									approved: z.number(),
									rejected: z.number(),
									/** Aprovados / finalizados, 0–1. `null` quando nada finalizou. */
									approvalRate: z.number().nullable(),
									/** Média das notas disponíveis, 0–10. */
									averageScore: z.number().nullable(),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const user = (await dashboardService.getUsersCompany(userId)) as UsersCompany | null
				if (!user?.company?.id) throw new BadRequestError('User or company not found')

				const { jobId, days } = request.body
				const since = new Date()
				since.setDate(since.getDate() - (days ?? 90))

				const interviews = (await dashboardService.listCompanyInterviews(user.company.id, {
					filters: [{ field: 'date', operator: '>=', value: since }],
				})) as CompanyInterview[]

				const scoped = jobId
					? interviews.filter((item) => item.post_job_id === jobId)
					: interviews

				const buckets = new Map<
					string,
					{ total: number; approved: number; rejected: number; scoreSum: number; scored: number }
				>()

				for (const interview of scoped) {
					const key = interview.source ?? DEFAULT_CANDIDATE_SOURCE
					const bucket = buckets.get(key) ?? {
						total: 0,
						approved: 0,
						rejected: 0,
						scoreSum: 0,
						scored: 0,
					}
					bucket.total += 1

					const status = (interview.candidateStatus ?? '').toLowerCase()
					if (status === 'approved') bucket.approved += 1
					if (status === 'rejected') bucket.rejected += 1

					const score = Number(interview.score)
					if (Number.isFinite(score) && score > 0) {
						bucket.scoreSum += score
						bucket.scored += 1
					}

					buckets.set(key, bucket)
				}

				const sources = [...buckets.entries()]
					.map(([source, bucket]) => {
						const decided = bucket.approved + bucket.rejected
						return {
							source,
							total: bucket.total,
							approved: bucket.approved,
							rejected: bucket.rejected,
							approvalRate: decided > 0 ? bucket.approved / decided : null,
							averageScore:
								bucket.scored > 0
									? Math.round((bucket.scoreSum / bucket.scored) * 10) / 10
									: null,
						}
					})
					.sort((a, b) => b.total - a.total)

				return { total: scoped.length, sources }
			},
		)
}
