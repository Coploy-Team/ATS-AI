import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createCandidateInterviewsService } from '@/lib/services/candidate-interviews-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

/**
 * As respostas gravadas de uma entrevista do próprio candidato.
 *
 * Antes disto o vídeo só era recuperável para a entrevista de PERFIL, por
 * `/dream-jobs/interview-details`, que resolve pelo ponteiro
 * `dreamJobsInterview` do usuário. As entrevistas feitas em EMPRESAS — que são
 * a maior parte do que a pessoa gravou — não tinham rota: ela não conseguia
 * rever a própria resposta em lugar nenhum do produto.
 *
 * O `jobAppliedId` é o mesmo `id` que `GET /interviews/mine` já devolve em cada
 * item, então a tela encadeia as duas chamadas sem precisar de outro conceito.
 */
export function listMyAnswers(app: FastifyInstance) {
	const interviews = createCandidateInterviewsService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/interviews/mine/:jobAppliedId/answers',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: "Recorded answers of one of the candidate's own interviews",
					description:
						'Video, transcript and per-answer observations. Score and hiring ' +
						'recommendation are deliberately not returned: those belong to the recruiter.',
					params: z.object({ jobAppliedId: z.string() }),
					response: {
						200: z.object({
							answers: z.array(
								z.object({
									id: z.string(),
									question: z.string(),
									videoUrl: z.string().nullable(),
									answer: z.string().nullable(),
									feedback: z.string().nullable(),
									strengths: z.array(z.string()),
									improvement: z.array(z.string()),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const answers = await interviews.answersOf(userId, request.params.jobAppliedId)
				/*
				 * `skipped` fica no serviço e não sai na resposta: quem consome quer as
				 * respostas que existem, e a pergunta pulada já foi removida.
				 */
				return { answers: answers.map(({ skipped: _skipped, ...rest }) => rest) }
			},
		)
}
