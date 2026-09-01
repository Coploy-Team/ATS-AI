import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'

export function createInfoJobs(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/info-jobs',
			{
				bodyLimit: 50 * 1024 * 1024, // 50MB para vídeos em base64
				schema: {
					'x-surface': 'empresa',
					tags: ['info-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Create a new info jobs',
					body: z.object({
						name: z.string(),
						finishText: z.string(),
						finishVideo: z.string(),
						welcomeText: z.string(),
						welcomeVideo: z.string(),
					}),
					response: {
						201: z.object({
							infoJobsId: z.string(),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return jobsService.createInfoJob(company.id, request.body)
			},
		)
}
