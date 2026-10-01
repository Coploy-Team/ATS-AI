import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuthService } from '@/lib/services/auth-service'

type UserDocument = {
	id: string
	display_name: string | null
}

export function checkRecruiter(app: FastifyInstance) {
	const authService = createAuthService(app.infra)
	app.withTypeProvider<ZodTypeProvider>().get(
		'/auth/check-recruiter',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['auth'],
				summary: 'Check if authenticated user is a recruiter (mirrors legacy generate-token logic)',
				response: {
					200: z.object({
						recruiter: z.boolean(),
					}),
				},
			},
		},
		async (request, reply) => {
			const authHeader = request.headers.authorization
			if (!authHeader?.startsWith('Bearer ')) {
				return reply.status(200).send({ recruiter: false })
			}

			try {
				const token = authHeader.substring(7)
				const decoded = await authService.verifyToken(token)
				const user = await authService.getUser(decoded.uid) as UserDocument | null

				return reply.status(200).send({
					recruiter: user?.display_name == null,
				})
			} catch {
				return reply.status(200).send({ recruiter: false })
			}
		},
	)
}
