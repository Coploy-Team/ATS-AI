import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { PostmarkClient } from '@/lib/postmark-client'

export function sendEmail(app: FastifyInstance) {
	const postmarkClient = new PostmarkClient()

	app.register(createAuth(app.infra)).post(
		'/send-email',
		{
			schema: {
				tags: ['email'],
				security: [{ bearerAuth: [] }],
				summary: 'Send an email',
				response: {
					200: z.object({ message: z.string() }),
					401: z.object({ message: z.string() }),
					500: z.object({
						statusCode: z.number(),
						code: z.string(),
						message: z.string(),
					}),
				},
			},
		},
		async (request, reply) => {
			await request.getUserMembership()

			const sendEmailBodySchema = z.object({
				email: z.string().email(),
				templateId: z.number(),
				templateModel: z.record(
					z.union([
						z.string(),
						z.number(),
						z.boolean(),
						z.null(),
						z.array(z.record(z.string(), z.unknown())),
					]),
				),
				fromEmail: z.string().email(),
			})

			const { email, templateId, templateModel, fromEmail } =
				sendEmailBodySchema.parse(request.body)

			try {
				await postmarkClient.sendEmailWithTemplate({
					from: fromEmail,
					to: email,
					templateId,
					templateModel,
				})
			} catch (error) {
				throw new BadRequestError(error as string)
			}

			return reply.status(200).send({ message: 'Email enviado com sucesso' })
		},
	)
}
