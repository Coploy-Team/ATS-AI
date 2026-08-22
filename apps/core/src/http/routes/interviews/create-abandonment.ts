import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { INTERVIEW_ABANDONMENT_REASONS } from '@coploy/domain'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewAbandonmentService } from '@/lib/services/interview-abandonment-service'

const createInterviewAbandonmentBodySchema = z.object({
	reason: z.enum(INTERVIEW_ABANDONMENT_REASONS),
	comment: z.string().trim().max(1000).optional(),
	jobId: z.string().min(1),
	companyId: z.string().min(1),
	userId: z.string().min(1).optional(),
	questionIndex: z.number().int().min(0).optional(),
})

const paramsSchema = z.object({
	interviewId: z.string().min(1),
})

async function getCandidateUserId(
	request: FastifyRequest,
): Promise<string | undefined> {
	const authHeader = request.headers.authorization
	if (!authHeader?.startsWith('Bearer ')) return undefined
	try {
		return await request.getCurrentUser()
	} catch {
		return undefined
	}
}

export function createInterviewAbandonment(app: FastifyInstance) {
	const service = createInterviewAbandonmentService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/interviews/:interviewId/abandonment',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Create interview abandonment reason',
					body: createInterviewAbandonmentBodySchema,
					params: paramsSchema,
					response: {
						201: z.object({
							success: z.literal(true),
							id: z.string(),
						}),
						400: z.object({
							error: z.string(),
							message: z.string(),
						}),
					},
				},
			},
			async (request, reply) => {
				const userId =
					request.body.userId ?? (await getCandidateUserId(request))
				const created = await service.create({
					interviewId: request.params.interviewId,
					jobId: request.body.jobId,
					companyId: request.body.companyId,
					userId,
					reason: request.body.reason,
					comment: request.body.comment,
					questionIndex: request.body.questionIndex,
				})

				return reply.status(201).send({
					success: true,
					id: created.id,
				})
			},
		)
}
