import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'

import type { Interview } from '@/types/interviews'
import type { PostJob } from '@coploy/domain'
import { toDate } from '@/lib/date-formatter'

export function getJobCandidatesByIds(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/jobs/:jobId/candidates/batch',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Get specific candidates by user IDs',
					description:
						'Get specific candidates (interviews) for a job by providing a list of user IDs. This is optimized for fetching specific candidates without pagination limits.',
					params: z.object({
						jobId: z.string().describe('The job ID'),
					}),
					body: z.object({
						userIds: z
							.array(z.string())
							.min(1)
							.max(100)
							.describe('Array of user IDs to fetch (max 100)'),
					}),
					response: {
						200: z.object({
							job: z.object({
								id: z.string(),
								jobName: z.string(),
								identifier: z.string().optional(),
							}),
							candidates: z.array(z.record(z.string(), z.unknown())),
							notFound: z
								.array(z.string())
								.describe('User IDs that were not found'),
						}),
						404: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()

				const { jobId } = request.params
				const { userIds } = request.body
				const companyId = company.id

				console.log(
					`[GET JOB CANDIDATES BY IDS] Buscando ${userIds.length} candidatos específicos para job ${jobId}`,
				)

				// Verificar se o job existe e pertence à empresa
				const job = await jobsService.getJob(
					companyId,
					jobId,
				) as PostJob | null

				if (!job) {
					throw new BadRequestError('Job not found')
				}

				// Buscar interviews finalizadas do job
				const allInterviews = await jobsService.listJobInterviews(
					companyId,
					jobId,
					{
						filters: [
							{
								field: 'finished',
								operator: '==',
								value: true,
							},
						],
					},
				) as Interview[]

				console.log(
					`[GET JOB CANDIDATES BY IDS] Total de interviews finalizadas: ${allInterviews.length}`,
				)

				// Criar um Set de userIds para busca rápida
				const userIdsSet = new Set(userIds)

				// Filtrar apenas as interviews dos usuários solicitados
				const matchedInterviews = allInterviews.filter((interview) => {
					const userId = interview.user_ref?.id
					return userId && userIdsSet.has(userId)
				})

				console.log(
					`[GET JOB CANDIDATES BY IDS] Candidatos encontrados: ${matchedInterviews.length}`,
				)

				// Processar candidatos
				const processedCandidates = matchedInterviews.map((interview) => {
					return {
						...interview,
						date: toDate(interview.date),
						date_select: toDate(interview.date_select),
						candidateStatus: interview.candidate_status,
						// Adicionar campos úteis
						job_applied_ref: interview.job_applied_ref?.id,
						user_ref: interview.user_ref?.id,
						job_ref: interview.job_ref?.id,
					}
				})

				// Identificar IDs que não foram encontrados
				const foundUserIds = new Set(
					processedCandidates.map((c) => c.user_ref).filter(Boolean),
				)
				const notFoundUserIds = userIds.filter((id) => !foundUserIds.has(id))

				if (notFoundUserIds.length > 0) {
					console.log(
						`[GET JOB CANDIDATES BY IDS] IDs não encontrados: ${notFoundUserIds.join(', ')}`,
					)
				}

				return reply.send({
					job: {
						id: job.id,
						jobName: job.jobName ?? '',
						identifier: job.identifier ?? undefined,
					},
					candidates: processedCandidates as unknown as Record<string, unknown>[],
					notFound: notFoundUserIds,
				})
			},
		)
}
