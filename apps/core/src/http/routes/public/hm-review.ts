import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createHiringManagerReviewService } from '@/lib/services/hm-review-service'

/**
 * Portal público do hiring manager (TOS-030).
 *
 * - exchange: consome o convite (uso único atômico) e devolve accessToken.
 * - shortlist / decisions: usam o accessToken (sem OAuth).
 */
export function hmReviewPublicRoutes(app: FastifyInstance) {
	const hmReviewService = createHiringManagerReviewService(app.infra)

	app.withTypeProvider<ZodTypeProvider>().post(
		'/public/hm-review/exchange',
		{
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				'x-surface': 'publico',
				tags: ['hm_review'],
				summary: 'Exchange a review invite code for an access token (single use)',
				body: z.object({ code: z.string().min(20) }),
				response: {
					200: z.object({
						accessToken: z.string(),
						companyId: z.string(),
						jobId: z.string(),
						expiresAt: z.string(),
					}),
					401: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			return hmReviewService.redeem(request.body.code)
		},
	)

	app.withTypeProvider<ZodTypeProvider>().get(
		'/public/hm-review/shortlist',
		{
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				'x-surface': 'publico',
				tags: ['hm_review'],
				summary: 'List the shortlist scoped to a redeemed review access token',
				headers: z.object({
					authorization: z.string().optional(),
					'x-hm-access-token': z.string().optional(),
				}),
				response: {
					200: z.object({
						job: z.object({
							id: z.string(),
							jobName: z.string(),
							identifier: z.string().optional(),
						}),
						companyId: z.string(),
						candidates: z.array(
							z.object({
								jobAppliedId: z.string(),
								interviewId: z.string(),
								name: z.string().nullable(),
								photoUrl: z.string().nullable(),
								score: z.number().nullable(),
								candidateStatus: z.string().nullable(),
								videoUrl: z.string().nullable(),
								suggestedAction: z.enum(['approve', 'reject', 'review']),
								date: z.string().nullable().optional(),
								summary: z.string().nullable(),
								strengths: z.array(z.string()),
								toDevelop: z.array(z.string()),
								competencies: z.array(
									z.object({
										label: z.string(),
										score: z.number(),
									}),
								),
								questions: z.array(
									z.object({
										question: z.string(),
										videoUrl: z.string().nullable(),
										score: z.number().nullable(),
										feedback: z.string().nullable(),
									}),
								),
							}),
						),
						rejectionReasons: z.array(
							z.object({
								code: z.string(),
								label: z.string(),
								requiresNote: z.boolean(),
							}),
						),
					}),
					401: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			const accessToken = extractAccessToken(request.headers)
			return hmReviewService.getShortlist(accessToken)
		},
	)

	app.withTypeProvider<ZodTypeProvider>().post(
		'/public/hm-review/decisions',
		{
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				'x-surface': 'publico',
				tags: ['hm_review'],
				summary: 'Approve or reject a shortlist candidate via HM review access token',
				headers: z.object({
					authorization: z.string().optional(),
					'x-hm-access-token': z.string().optional(),
				}),
				body: z.object({
					jobAppliedId: z.string().min(1),
					action: z.enum(['approve', 'reject']),
					rejectionReasonCode: z.string().optional(),
					rejectionNote: z.string().optional(),
					rejectionFeedbackMessage: z.string().optional(),
				}),
				response: {
					200: z.object({
						message: z.string(),
						interview_id: z.string(),
						candidate_status: z.string(),
					}),
					401: z.object({ message: z.string() }),
				},
			},
		},
		async (request) => {
			const accessToken = extractAccessToken(request.headers)
			return hmReviewService.submitDecision({
				accessToken,
				...request.body,
			})
		},
	)
}

function extractAccessToken(headers: {
	authorization?: string
	'x-hm-access-token'?: string
}): string {
	const fromHeader = headers['x-hm-access-token']?.trim()
	if (fromHeader) return fromHeader

	const auth = headers.authorization?.trim()
	if (auth?.toLowerCase().startsWith('bearer ')) {
		return auth.slice(7).trim()
	}

	return ''
}
