import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createKanbanService } from '@/lib/services/kanban-service'

export function bulkUpdateStatus(app: FastifyInstance) {
	const kanbanService = createKanbanService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.patch(
			'/companies/interviews/bulk-status',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['kanban'],
					security: [{ bearerAuth: [] }],
					summary: 'Update candidate status for multiple interviews at once',
					body: z.object({
						candidateIds: z.array(z.string()).min(1).max(50),
						candidate_status: z.string().min(1),
						postJobId: z.string(),
						rejectionReasonCode: z.string().optional(),
						rejectionNote: z.string().optional(),
						rejection_email_sent_at: z.string().optional(),
						rejectionFeedbackMessage: z.string().optional(),
					}),
					response: {
						200: z.object({
							message: z.string(),
							results: z.array(
								z.object({
									candidateId: z.string(),
									success: z.boolean(),
									error: z.string().optional(),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const { company, user } = (await request.getUserMembership()) as {
					company: { id: string }
					user?: { display_name?: string | null }
				}
				const {
					candidateIds,
					candidate_status,
					postJobId,
					rejectionReasonCode,
					rejectionNote,
					rejection_email_sent_at,
					rejectionFeedbackMessage,
				} = request.body

				return kanbanService.bulkUpdateStatus({
					companyId: company.id,
					candidateIds,
					candidateStatus: candidate_status,
					postJobId,
					rejectionReasonCode,
					rejectionNote,
					rejectionEmailSentAt: rejection_email_sent_at,
					rejectionFeedbackMessage,
					rejectedByUserId: userId,
					// o histórico diz QUEM moveu, aqui e no movimento individual
					actorName: user?.display_name ?? null,
				})
			},
		)
}
