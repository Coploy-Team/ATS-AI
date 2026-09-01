import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createSharedCandidateLinkService } from '@/lib/services/shared-candidate-link-service'

const sectionsSchema = z.object({
	score: z.boolean(),
	feedback: z.boolean(),
	analysis: z.boolean(),
	questions: z.boolean(),
})

export function createShareLink(app: FastifyInstance) {
	const sharedCandidateLinkService = createSharedCandidateLinkService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/jobs/:jobId/share-links',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Create a share link for a set of candidates',
					description:
						'Creates an opaque share code that, when resolved, returns candidate data already cut server-side by the liberated sections.',
					params: z.object({
						jobId: z.string().describe('The job ID'),
					}),
					body: z.object({
						candidateIds: z
							.array(z.string())
							.min(1)
							.max(100)
							.describe('User IDs of the candidates included in the share'),
						sections: sectionsSchema,
					}),
					response: {
						200: z.object({
							code: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const userId = await request.getCurrentUser()
				const { company } = await request.getUserMembership()
				const { jobId } = request.params
				const { candidateIds, sections } = request.body

				const { code } = await sharedCandidateLinkService.createShareLink(
					company.id,
					jobId,
					{ candidateIds, sections },
					userId,
				)

				return reply.send({ code })
			},
		)
}
