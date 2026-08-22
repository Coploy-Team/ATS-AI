import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'
import type { UsersCompany } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'

export function updateInterview(app: FastifyInstance) {
	const interviewsService = createInterviewsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.patch(
			'/companies/interviews/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Update an interview',
					params: z.object({
						id: z.string(),
					}),
					body: z.object({
						candidate_status: z.string(),
						postJobId: z.string(),
						rejection_email_sent_at: z.string().optional(),
						rejectionFeedbackMessage: z.string().optional(),
						rejectionReasonCode: z.string().optional(),
						rejectionNote: z.string().optional(),
					}),
					response: {
						200: z.object({
							message: z.string(),
							interview_id: z.string(),
							candidate_status: z.string(),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const user = (await interviewsService.getUsersCompany(userId)) as UsersCompany | null
				if (!user) throw new BadRequestError('User not found')

				const companyId = (user.company as { id?: string })?.id
				const {
					candidate_status,
					postJobId,
					rejection_email_sent_at,
					rejectionFeedbackMessage,
					rejectionReasonCode,
					rejectionNote,
				} = request.body

				return interviewsService.updateInterviewStatus({
					interviewId: request.params.id,
					candidateStatus: candidate_status,
					postJobId,
					companyId: companyId!,
					rejectionEmailSentAt: rejection_email_sent_at,
					rejectionFeedbackMessage,
					rejectionReasonCode,
					rejectionNote,
					rejectedByUserId: userId,
					// o histórico diz QUEM moveu; o nome vem do colaborador logado
					actorName: (user as { display_name?: string | null }).display_name ?? null,
				})
			},
		)
}
