import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'
import type { UsersCompany } from '@coploy/domain'

export function toggleCandidateLike(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/candidates/:userId/:jobAppliedId/like/:action',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['candidates'],
					security: [{ bearerAuth: [] }],
					summary: 'Toggle like on a candidate',
					description:
						'Toggle like on a candidate. Creates if not exists, removes if exists.',
					params: z.object({
						userId: z.string().describe('User ID'),
						jobAppliedId: z.string().describe('Job applied ID'),
						action: z.enum(['like', 'dislike']).describe('Action to perform'),
					}),
					response: {
						200: z.object({
							liked: z.boolean(),
							likes: z.array(
								z.object({
									id: z.string(),
									name: z.string().nullable().optional(),
									user_id: z.string().nullable().optional(),
									avatar_url: z.string().nullable().optional(),
									email: z.string().nullable().optional(),
									created_at: z.any(),
									action: z.boolean().nullable().optional(),
								}),
							),
							totalLikes: z.number(),
							totalDislikes: z.number(),
						}),
					},
				},
			},
			async (request) => {
				const { userId, jobAppliedId, action } = request.params
				const currentUserId = await request.getCurrentUser()
				const { company } = await request.getUserMembership()

				const currentUser = (await interviewsService.getUsersCompany(
					currentUserId,
				)) as UsersCompany | null

				return interviewsService.toggleCandidateLike({
					userId,
					jobAppliedId,
					action,
					currentUserId,
					companyId: company.id,
					currentUser,
				})
			},
		)
}
