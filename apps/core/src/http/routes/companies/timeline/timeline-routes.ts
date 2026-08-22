import { TIMELINE_EVENT_TYPES } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createCandidateTimelineService } from '@/lib/services/candidate-timeline-service'

const entrySchema = z.object({
	id: z.string(),
	companyId: z.string(),
	jobId: z.string(),
	candidateId: z.string(),
	type: z.enum(TIMELINE_EVENT_TYPES),
	authorId: z.string().nullable().optional(),
	authorName: z.string().nullable().optional(),
	body: z.string().nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
})

/**
 * Linha do tempo do candidato (V2-303) — registro INTERNO.
 *
 * Nada daqui chega ao candidato: a superfície dele tem contrato próprio, com a
 * régua de "veredito é do recrutador, ofício é do candidato".
 */
export function timelineRoutes(app: FastifyInstance) {
	const service = createCandidateTimelineService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/jobs/:jobId/candidates/:candidateId/timeline',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['timeline'],
					security: [{ bearerAuth: [] }],
					summary: 'Internal timeline of a candidate (events + comments)',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					response: { 200: z.object({ entries: z.array(entrySchema) }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId, candidateId } = request.params
				return service.listTimeline({ companyId: company.id, jobId, candidateId })
			},
		)
		.post(
			'/companies/jobs/:jobId/candidates/:candidateId/timeline/comments',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['timeline'],
					security: [{ bearerAuth: [] }],
					summary: 'Comment on a candidate (internal)',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					body: z.object({ body: z.string().min(1).max(2000) }),
					response: { 201: z.object({ entry: entrySchema }) },
				},
			},
			async (request, reply) => {
				const { company, user } = (await request.getUserMembership()) as {
					company: { id: string }
					user?: { display_name?: string | null }
				}
				const authorId = await request.getCurrentUser()
				const { jobId, candidateId } = request.params

				const entry = await service.addComment({
					companyId: company.id,
					jobId,
					candidateId,
					authorId,
					authorName: user?.display_name ?? null,
					body: request.body.body,
				})
				return reply.status(201).send({ entry })
			},
		)
}
