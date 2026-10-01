import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'

export function updateInfoJobs(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.put(
			'/companies/info-jobs/:infoJobsId',
			{
				bodyLimit: 50 * 1024 * 1024, // 50MB para vídeos em base64
				schema: {
					'x-surface': 'empresa',
					tags: ['info-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Update an info jobs completely',
					params: z.object({
						infoJobsId: z.string(),
					}),
					body: z.object({
						name: z.string(),
						finishText: z.string(),
						finishVideo: z.string(),
						// BUG FIX: welcomeText and welcomeVideo are text/URL fields, NOT dates.
						// Previously had .transform((val) => new Date(val)) which was incorrect.
						welcomeText: z.string(),
						welcomeVideo: z.string(),
					}),
					response: {
						200: z.object({
							success: z.boolean(),
						}),
					},
				},
			},
			async (request) => {
				const { infoJobsId } = request.params
				const { company } = await request.getUserMembership()
				await jobsService.updateInfoJob(company.id, infoJobsId, request.body)
				return { success: true }
			},
		)
}
