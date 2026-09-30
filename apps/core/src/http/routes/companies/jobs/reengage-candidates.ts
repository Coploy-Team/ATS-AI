import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewInviteService } from '@/lib/services/interview-invite-service'

/**
 * Reengajar candidatos da base numa vaga aberta (V2-603, GAP 6).
 *
 * Rota separada do convite de pipeline de propósito: aqui a pessoa **não está**
 * nesta vaga. O convite move quem já entrou; este chama de volta quem saiu — e
 * misturar os dois numa rota faria a diferença sumir na revisão.
 */
export function reengageCandidates(app: FastifyInstance) {
	const interviewInviteService = createInterviewInviteService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/jobs/:jobId/reengage',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Convida candidatos da base para uma vaga aberta',
					description:
						'Envia o convite da entrevista para pessoas que já estiveram em outros processos. ' +
						'Não cria candidatura: quem entra é o candidato, pelo link — assim o funil não ' +
						'mostra gente que nunca disse sim.',
					params: z.object({ jobId: z.string() }),
					body: z.object({
						userIds: z.array(z.string()).min(1).max(50),
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
				const userId = await request.getCurrentUser().catch(() => undefined)

				return interviewInviteService.reengageToJob({
					companyId: company.id,
					jobId: request.params.jobId,
					userIds: request.body.userIds,
					message: request.body.message,
					invitedByUserId: userId ?? undefined,
				})
			},
		)
}
