import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'

const infoJobsSchema = z.object({
	name: z.string().optional(),
	finishText: z.string().optional(),
	finishVideo: z.string().optional(),
	welcomeText: z.string().optional(),
	welcomeVideo: z.string().optional(),
})

export function patchInfoJobs(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.patch(
			'/companies/info-jobs/:infoJobsId',
			{
				bodyLimit: 50 * 1024 * 1024, // 50MB para vídeos em base64
				schema: {
					'x-surface': 'empresa',
					tags: ['info-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Update specific fields of an info jobs',
					params: z.object({
						infoJobsId: z.string(),
					}),
					body: infoJobsSchema.refine((data) => Object.keys(data).length > 0, {
						message: 'At least one field must be provided for update',
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
				await jobsService.patchInfoJob(company.id, infoJobsId, request.body)
				return { success: true }
			},
		)
}
