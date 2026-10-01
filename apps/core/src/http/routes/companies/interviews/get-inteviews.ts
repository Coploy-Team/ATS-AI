import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'
import { jobIdsInScope } from '@/lib/access-scope'
import type { UsersCompany } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'

export function getInterviews(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/interviews',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Get all company interviews with pagination',
					querystring: z.object({
						page: z.string().default('1').transform(Number),
						limit: z.string().default('10').transform(Number),
						find: z.string().optional(),
						/** Etapa canônica (applied, pending, selected, approved, hired, rejected). */
						status: z.string().optional(),
						/** Nota mínima (0–10). Aplicada DEPOIS da máscara SaaS. */
						minScore: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
						/** Janela de candidatura (ISO). */
						from: z.string().optional(),
						to: z.string().optional(),
						/** `candidate` = uma linha por pessoa no conjunto inteiro. */
						groupBy: z.enum(['candidate']).optional(),
					}),
					response: {
						200: z.object({
							/**
							 * Era `z.record(unknown)` — o SDK gerava `{[key:string]: unknown}`
							 * e todo cliente precisava adivinhar o shape com cast.
							 * `.passthrough()` preserva o doc legado inteiro.
							 */
							interviews: z.array(
								z
									.object({
										id: z.string(),
										name: z.string().nullable().optional(),
										email: z.string().nullable().optional(),
										photo_url: z.string().nullable().optional(),
										occupation: z.string().nullable().optional(),
										score: z.union([z.number(), z.string()]).nullable().optional(),
										finished: z.boolean().nullable().optional(),
										candidateStatus: z.string().nullable().optional(),
										candidate_status: z.string().nullable().optional(),
										date: z.union([z.string(), z.date()]).nullable().optional(),
										dateSelect: z.union([z.string(), z.date()]).nullable().optional(),
										jobName: z.string().nullable().optional(),
										job_ref: z.unknown().optional(),
										job_applied_ref: z.unknown().optional(),
										user_ref: z.unknown().optional(),
										typeInterview: z.string().nullable().optional(),
										/** Preenchidos só quando `groupBy=candidate` (V2-205). */
										interviewCount: z.number().optional(),
										otherInterviews: z.array(z.unknown()).optional(),
									})
									.passthrough(),
							),
							pagination: z.object({
								total: z.number(),
								page: z.number(),
								totalPages: z.number(),
								hasMore: z.boolean(),
							}),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const user = await interviewsService.getUsersCompany(userId) as UsersCompany | null
				if (!user?.company?.id) {
					throw new BadRequestError('User or company not found')
				}

				const { page, limit, find, status, minScore, from, to, groupBy } = request.query
				return interviewsService.listInterviews({
					companyId: user.company.id,
					// recrutador só enxerga as entrevistas das vagas que criou
					jobIdsInScope: await jobIdsInScope(app.infra, request, user.company.id),
					page,
					limit,
					find,
					status,
					minScore,
					from,
					to,
					groupBy,
				})
			},
		)
}
