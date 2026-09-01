import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { recordCoreAiUsage } from '@/lib/ai-usage'

const LANGUAGE_ID_TO_NAME: Record<number, string> = {
	0: 'Spanish',
	1: 'French',
	2: 'English',
	3: 'Italian',
	4: 'Portuguese',
}

export function generateEvaluationQuestions(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/ia/evaluation-questions',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['ia'],
					security: [{ bearerAuth: [] }],
					summary: 'Gera perguntas para avaliação de idiomas (typeInterview: evaluation)',
					body: z.object({
						evaluation: z.object({
							language: z.number(),
						}),
						jobDescription: z.string(),
						jobCategories: z.string(),
						jobName: z.string(),
						numberQuestions: z.number().int().min(1).max(30),
					}),
					response: {
						200: z.object({
							questions: z.array(
								z.object({
									id: z.string(),
									question: z.string(),
									levelQ: z.string(),
									skills: z.enum(['listening', 'speaking', 'writing']),
								}),
							),
						}),
						400: z.object({
							message: z.string(),
						}),
					},
				},
			},
			async (request) => {
				try {
					const userId = await request.getCurrentUser()
					const membership = await request.getUserMembership()
					const body = request.body

					const languageName =
						LANGUAGE_ID_TO_NAME[body.evaluation.language] ?? 'Portuguese'
					const category =
						body.jobCategories.trim() !== ''
							? body.jobCategories
							: 'gramática'

					const accessToken = await request.getAccessToken()
					const engineUrl = env.ENGINE_URL ?? 'http://localhost:3334'

					const response = await axios.post<{
						questions: Array<{
							question: string
							levelQ: string
							skills: 'listening' | 'speaking' | 'writing'
						}>
						model?: string
						provider?: 'openai' | 'minimax'
						usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
					}>(
						`${engineUrl}/evaluation/generate-questions`,
						{
							language: languageName,
							category,
							description: body.jobDescription,
							numberQuestions: body.numberQuestions,
							job: body.jobName,
						},
						{
							headers: {
								Authorization: `Bearer ${accessToken}`,
								'Content-Type': 'application/json',
								'X-Request-Id': request.id,
							},
							timeout: 120_000,
						},
					)

					if (!response.data.questions?.length) {
						throw new BadRequestError('Nenhuma pergunta foi gerada')
					}

					recordCoreAiUsage({
						infra: app.infra,
						company: membership.company,
						userId,
						requestId: request.id,
						surface: 'evaluation_generate_questions',
						model: response.data.model,
						provider: response.data.provider,
						usage: response.data.usage,
						metadata: {
							language: languageName,
							category,
							jobName: body.jobName,
							questionCount: response.data.questions.length,
						},
					})

					return {
						questions: response.data.questions.map((q, i) => ({
							id: `q${i + 1}`,
							question: q.question,
							levelQ: q.levelQ,
							skills: q.skills,
						})),
					}
				} catch (error) {
					if (axios.isAxiosError(error)) {
						const message =
							error.response?.data?.message ??
							error.response?.data?.error ??
							error.message
						throw new BadRequestError(message)
					}
					throw new BadRequestError(error as string)
				}
			},
		)
}
