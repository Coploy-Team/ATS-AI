import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'
import {
	createSharedCandidateLinkService,
	stripListCandidate,
} from '@/lib/services/shared-candidate-link-service'
import { toDate } from '@/lib/date-formatter'
import type { Interview } from '@/types/interviews'
import type { PostJob } from '@coploy/domain'

export function getShareLinkCandidates(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	const sharedCandidateLinkService = createSharedCandidateLinkService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/share-links/:code/candidates',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Get the candidate list liberated by a share link',
					params: z.object({
						code: z.string(),
					}),
					response: {
						200: z.object({
							job: z.object({
								id: z.string(),
								jobName: z.string(),
								identifier: z.string().optional(),
							}),
							candidates: z.array(z.record(z.string(), z.unknown())),
							visibility: z.object({
								score: z.boolean(),
								feedback: z.boolean(),
								analysis: z.boolean(),
								questions: z.boolean(),
							}),
						}),
					},
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const { code } = request.params

				const record = await sharedCandidateLinkService.resolveShareLink(code)

				if (record.companyId !== company.id) {
					throw new BadRequestError('Share link inválido')
				}

				const job = (await jobsService.getJob(
					record.companyId,
					record.jobId,
				)) as PostJob | null

				if (!job) {
					throw new BadRequestError('Job not found')
				}

				const allInterviews = (await jobsService.listJobInterviews(
					record.companyId,
					record.jobId,
					{
						filters: [
							{ field: 'finished', operator: '==', value: true },
						],
					},
				)) as Interview[]

				const candidateIdsSet = new Set(record.candidateIds)

				const matchedInterviews = allInterviews.filter((interview) => {
					const userId = interview.user_ref?.id
					return userId && candidateIdsSet.has(userId)
				})

				const candidates = matchedInterviews.map((interview) => {
					const processed = {
						...interview,
						date: toDate(interview.date),
						date_select: toDate(interview.date_select),
						candidateStatus: interview.candidate_status,
						job_applied_ref: interview.job_applied_ref?.id,
						user_ref: interview.user_ref?.id,
						job_ref: interview.job_ref?.id,
					}
					return stripListCandidate(
						processed as unknown as Record<string, unknown>,
						record.sections,
					)
				})

				return reply.send({
					job: {
						id: job.id,
						jobName: job.jobName ?? '',
						identifier: job.identifier ?? undefined,
					},
					candidates,
					visibility: record.sections,
				})
			},
		)
}
