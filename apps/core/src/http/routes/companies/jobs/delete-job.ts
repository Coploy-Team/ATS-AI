import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'

export function deleteJob(app: FastifyInstance) {
	const jobsService = createJobsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.delete(
			'/companies/jobs/:jobId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Delete a job post',
					params: z.object({
						jobId: z.string(),
					}),
					response: {
						200: z.object({
							success: z.boolean(),
						}),
					},
				},
			},
			async (request) => {
				const { jobId } = request.params
				const { company } = await request.getUserMembership()
				await jobsService.deleteJob(company.id, jobId)
				return { success: true }
			},
		)
}
