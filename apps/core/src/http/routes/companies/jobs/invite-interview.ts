import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewInviteService } from '@/lib/services/interview-invite-service'

/**
 * Convite para a entrevista IA (ação primária do Pipeline).
 *
 * Move o candidato para a etapa de Entrevista IA e manda o link por e-mail.
 * A resposta é por candidato — mover e notificar podem ter destinos
 * diferentes, e o recrutador precisa saber quem ficou sem e-mail.
 */
export function inviteInterview(app: FastifyInstance) {
	const interviewInviteService = createInterviewInviteService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/jobs/:jobId/invite-interview',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Invite candidates to the AI interview',
					description:
						'Move os candidatos para a etapa de Entrevista IA e envia o link por e-mail. ' +
						'Mover sempre acontece; o e-mail é best-effort e o resultado vem por candidato.',
					params: z.object({ jobId: z.string() }),
					body: z.object({
						candidateIds: z.array(z.string()).min(1).max(50),
						message: z.string().max(2000).optional(),
					}),
					response: {
						200: z.object({
							invited: z.number(),
							sent: z.number(),
							interviewUrl: z.string(),
							results: z.array(
								z.object({
									candidateId: z.string(),
									status: z.enum(['sent', 'moved_without_email', 'skipped']),
									reason: z.string().optional(),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId } = request.params
				const { candidateIds, message } = request.body

				return interviewInviteService.inviteToInterview({
					companyId: company.id,
					jobId,
					candidateIds,
					message,
				})
			},
		)
}
