import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewTranslationService } from '@/lib/services/interview-translation-service'

const translationParamsSchema = z.object({
	userId: z.string(),
	jobAppliedId: z.string(),
	language: z.string(),
})

const captionParamsSchema = translationParamsSchema.extend({
	questionId: z.string(),
})

export function interviewTranslationRoutes(app: FastifyInstance) {
	const translationService = createInterviewTranslationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get<{
			Params: z.infer<typeof translationParamsSchema>
		}>(
			'/companies/interviews/:userId/:jobAppliedId/translation/:language',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Translate cached candidate interview result',
					params: translationParamsSchema,
					response: {
						200: z.object({
							language: z.string(),
							sourceLanguage: z.string(),
							cached: z.boolean(),
							result: z.record(z.string(), z.unknown()),
						}),
					},
				},
			},
			async (request) => {
				const membership = await request.getUserMembership()
				const { userId, jobAppliedId, language } = request.params
				return translationService.getTranslatedResult({
					userId,
					jobAppliedId,
					language,
					company: membership.company,
					requestId: request.id,
				})
			},
		)
		.get<{
			Params: z.infer<typeof captionParamsSchema>
		}>(
			'/companies/interviews/:userId/:jobAppliedId/questions/:questionId/captions/:language',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Translate cached interview captions as WebVTT',
					params: captionParamsSchema,
					response: {
						200: z.string(),
					},
				},
			},
			async (request, reply) => {
				const membership = await request.getUserMembership()
				const { userId, jobAppliedId, questionId, language } = request.params
				const result = await translationService.getCaptionVtt({
					userId,
					jobAppliedId,
					questionId,
					language,
					company: membership.company,
					requestId: request.id,
				})
				return reply
					.header('Content-Type', 'text/vtt; charset=utf-8')
					.header('X-Coploy-Translation-Cache', result.cached ? 'hit' : 'miss')
					.send(result.vtt)
			},
		)
}
