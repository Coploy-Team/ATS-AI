import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'


export function getInfoJob(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/info-jobs/:infoJobsId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['info-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Get a specific info job by ID',
					params: z.object({
						infoJobsId: z.string(),
					}),
					response: {
						200: z.object({
							infoJob: z.object({
								id: z.string(),
								name: z.string(),
								finishText: z.string(),
								finishVideo: z.string(),
								welcomeText: z.date(),
								welcomeVideo: z.date(),
							}),
						}),
					},
				},
			},
			async (request) => {
				const { infoJobsId } = request.params
				const { company } = await request.getUserMembership()

				const infoJobData = await jobsService.getInfoJob(
					company.id,
					infoJobsId,
				)

				if (!infoJobData) {
					throw new BadRequestError('InfoJobs not found')
				}

				return {
					infoJob: {
						id: infoJobData.id as string,
						name: infoJobData.name as string,
						finishText: infoJobData.finishText as string,
						finishVideo: infoJobData.finishVideo as string,
						welcomeText:
							(infoJobData.welcomeText as unknown) instanceof Date
								? infoJobData.welcomeText as unknown as Date
								: new Date(infoJobData.welcomeText as string),
						welcomeVideo:
							(infoJobData.welcomeVideo as unknown) instanceof Date
								? infoJobData.welcomeVideo as unknown as Date
								: new Date(infoJobData.welcomeVideo as string),
					},
				}
			},
		)
}
