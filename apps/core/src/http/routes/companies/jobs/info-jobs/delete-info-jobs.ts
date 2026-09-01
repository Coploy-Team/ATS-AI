import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'

export function deleteInfoJobs(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.delete(
			'/companies/info-jobs/:infoJobsId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['info-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Delete an info jobs',
					params: z.object({
						infoJobsId: z.string(),
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
				await jobsService.deleteInfoJob(company.id, infoJobsId)
				return { success: true }
			},
		)
}
