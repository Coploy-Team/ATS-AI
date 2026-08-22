import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createScreeningKnockoutService } from '@/lib/services/screening-knockout-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

const submitScreeningKnockoutResponseSchema = z.object({
	passed: z.boolean(),
	score: z.number(),
	failedNodeIds: z.array(z.string()),
	rejectionReasonCode: z.string().nullable(),
	action: z.enum(['continue_interview', 'rejected']),
	jobAppliedId: z.string(),
	jobId: z.string(),
	companyId: z.string(),
	rejectionEvidence: z.string().nullable(),
	failedRequirementLabel: z.string().nullable(),
})

const screeningKnockoutMirrorResponseSchema = z.object({
	rejected: z.boolean(),
	rejectionEvidence: z.string().nullable(),
	failedRequirementLabel: z.string().nullable(),
	rejectionDecisionSource: z.enum(['manual', 'bulk', 'knockout']).nullable(),
})

export function submitScreeningKnockoutRoutes(app: FastifyInstance) {
	const screeningKnockoutService = createScreeningKnockoutService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/careers/:companyId/jobs/:jobId/applications/:jobAppliedId/screening-knockout',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['careers'],
					security: [{ bearerAuth: [] }],
					summary: 'Read candidate-facing knockout rejection explanation',
					params: z.object({
						companyId: z.string().min(1),
						jobId: z.string().min(1),
						jobAppliedId: z.string().min(1),
					}),
					response: {
						200: screeningKnockoutMirrorResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const candidateUserId = await request.getCurrentUser()
				const result = await screeningKnockoutService.getCandidateMirror({
					companyId: request.params.companyId,
					jobId: request.params.jobId,
					jobAppliedId: request.params.jobAppliedId,
					candidateUserId,
				})

				return reply.status(200).send(result)
			},
		)
		.post(
			'/careers/:companyId/jobs/:jobId/applications/:jobAppliedId/screening-knockout',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['careers'],
					security: [{ bearerAuth: [] }],
					summary: 'Submit deterministic screening knockout answers',
					params: z.object({
						companyId: z.string().min(1),
						jobId: z.string().min(1),
						jobAppliedId: z.string().min(1),
					}),
					body: z.object({
						answers: z.record(z.string(), z.unknown()),
					}),
					response: {
						200: submitScreeningKnockoutResponseSchema,
					},
				},
			},
			async (request, reply) => {
				const candidateUserId = await request.getCurrentUser()
				const result = await screeningKnockoutService.submit({
					companyId: request.params.companyId,
					jobId: request.params.jobId,
					jobAppliedId: request.params.jobAppliedId,
					candidateUserId,
					answers: request.body.answers,
				})

				return reply.status(200).send(result)
			},
		)
}
