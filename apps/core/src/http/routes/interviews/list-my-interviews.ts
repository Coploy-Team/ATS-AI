import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createCandidateInterviewsService } from '@/lib/services/candidate-interviews-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

const summarySchema = z.object({
	id: z.string(),
	jobId: z.string().nullable(),
	companyId: z.string().nullable(),
	jobName: z.string().nullable(),
	companyName: z.string().nullable(),
	companyLogo: z.string().nullable(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	finished: z.boolean(),
	status: z.enum(['pending', 'in_progress', 'completed']),
	questionsAnswered: z.number(),
	questionsTotal: z.number(),
	interviewUrl: z.string(),
	feedback: z.object({
		strengths: z.array(z.string()),
		development: z.array(z.string()),
		suggestions: z.array(z.string()),
	}),
	rejectionExplanation: z.string().nullable(),
	failedRequirementLabel: z.string().nullable(),
})

/**
 * Entrevistas do candidato logado, separadas por natureza.
 *
 * A de perfil é dele — fala da própria carreira e é o que o expõe no hunting.
 * As de empresa foram gravadas a convite de uma vaga real. São coisas
 * diferentes e a tela precisa dizer isso; até aqui o candidato só enxergava a
 * de perfil, e as que ele fez em empresas não apareciam em lugar nenhum.
 */
export function listMyInterviews(app: FastifyInstance) {
	const interviewsService = createCandidateInterviewsService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/interviews/mine',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: "List the authenticated candidate's own interviews",
					response: {
						200: z.object({
							profileInterview: summarySchema.nullable(),
							companyInterviews: z.array(summarySchema),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				return interviewsService.listMine(userId)
			},
		)
}
