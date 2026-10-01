import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { JobApplied } from '@coploy/domain'
import { createAuth } from '@/http/routes/middlewares/auth'
import { assertJobInScope, jobIdsInScope } from '@/lib/access-scope'
import { sharedCoployProfile } from '@/lib/services/candidate-public-view-types'
import { resolveBoardCandidate } from '@/lib/services/interview-schedule-service'
import { createTranscriptSearchService } from '@/lib/services/transcript-search-service'

/**
 * Busca nas transcrições. O recrutador pergunta; a resposta é o trecho do
 * vídeo em que a pessoa falou disso (e, quando permitido, uma resposta curta
 * escrita a partir dele), ou "não encontrei". Olha a página `@` de quem
 * compartilhou o perfil Coploy com a vaga e as entrevistas que a pessoa fez
 * para esta empresa, dentro do alcance de quem pergunta.
 */
const hitSchema = z.object({
	itemId: z.string(),
	source: z.enum(['profile', 'interview']),
	questionLabel: z.string().nullable(),
	videoUrl: z.string().nullable(),
	text: z.string(),
	start: z.number().nullable(),
	end: z.number().nullable(),
})

export function transcriptSearch(app: FastifyInstance) {
	const service = createTranscriptSearchService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/jobs/:jobId/candidates/:candidateId/transcript-search',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['jobs'],
					security: [{ bearerAuth: [] }],
					summary: "Search what a candidate said in their interviews with this company and in their published Coploy profile",
					description:
						'Returns the passages that answer the question, with the time in the video, or `not_found`. Searches the ' +
						"interviews the candidate did for this company's jobs within the caller's scope, plus the answers published on " +
						'their Coploy page when they shared it with this job. `answer` is a short text written by AI from the cited ' +
						'passages, only when allowed (the candidate enables it for their page). Questions that ask to judge the person return `evaluative`.',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					body: z.object({ query: z.string().min(3).max(300) }),
					response: {
						200: z.object({
							status: z.enum(['found', 'not_found', 'evaluative', 'no_published_answers', 'not_available']),
							hit: hitSchema.nullable(),
							hits: z.array(hitSchema),
							answer: z.string().nullable(),
							remainingToday: z.number().nullable(),
						}),
						400: z.object({ message: z.string() }),
						404: z.object({ message: z.string() }),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId, candidateId } = request.params
				await assertJobInScope(app.infra, request, company.id, jobId)
				const board = await resolveBoardCandidate(app.infra, company.id, jobId, candidateId)
				const [doc, jobApplied] = await Promise.all([
					app.infra.candidateRepository.getJobInterview(company.id, jobId, candidateId).catch(() => null) as Promise<Record<string, unknown> | null>,
					app.infra.candidateRepository.getJobApplied(board.userId, board.jobAppliedId).catch(() => null) as Promise<JobApplied | null>,
				])
				return service.search({
					companyId: company.id,
					userId: board.userId,
					query: request.body.query,
					includeProfile: sharedCoployProfile(jobApplied, doc ?? undefined),
					jobIdsInScope: await jobIdsInScope(app.infra, request, company.id),
				})
			},
		)
}
