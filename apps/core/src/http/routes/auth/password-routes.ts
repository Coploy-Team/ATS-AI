import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { BadRequestError } from '@coploy/shared/errors'

import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createPasswordService } from '@/lib/services/password-service'

/**
 * Senha: pedir redefinição (público) e trocar estando logado.
 *
 * As duas ficam no mesmo arquivo porque compartilham o service e a política de
 * força — separá-las convidaria as regras a divergirem, e "a senha que o
 * cadastro aceita é recusada na troca" é um jeito ruim de descobrir isso.
 */
export function passwordRoutes(app: FastifyInstance) {
	const service = createPasswordService(app.infra)

	app.withTypeProvider<ZodTypeProvider>().post(
		'/auth/password-reset',
		{
			config: {
				/*
				 * Rota pública que dispara e-mail para terceiros: sem limite, vira
				 * ferramenta de flood na caixa de entrada de quem tem conta aqui.
				 */
				rateLimit: rateLimitConfigs.auth,
			},
			schema: {
				'x-surface': 'publico',
				tags: ['auth'],
				summary: 'Request a password reset link',
				description:
					'Sends the reset link by e-mail. Always answers 200 — telling apart "sent" from "no such account" would turn this into a way to check which e-mails have an account.',
				body: z.object({
					email: z.string().email(),
					language: z.string().optional(),
				}),
				response: {
					200: z.object({ status: z.literal('sent') }),
				},
			},
		},
		async (request, reply) => {
			const result = await service.requestReset({
				email: request.body.email,
				language: request.body.language ?? null,
			})
			return reply.send(result)
		},
	)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/auth/change-password',
			{
				config: { rateLimit: rateLimitConfigs.auth },
				schema: {
					'x-surface': 'empresa',
					tags: ['auth'],
					security: [{ bearerAuth: [] }],
					summary: 'Change the password of the logged-in user',
					body: z.object({
						currentPassword: z.string().min(1),
						newPassword: z.string().min(8),
					}),
					response: {
						200: z.object({ status: z.literal('changed') }),
					},
				},
			},
			async (request, reply) => {
				const { user } = (await request.getUserMembership()) as {
					user?: { email?: string | null }
				}
				const userId = await request.getCurrentUser()

				const email = user?.email
				if (!email) {
					// conta sem e-mail não tem como provar a senha atual
					throw new BadRequestError('Conta sem e-mail cadastrado.')
				}

				const result = await service.changePassword({
					userId,
					email,
					currentPassword: request.body.currentPassword,
					newPassword: request.body.newPassword,
				})
				return reply.send(result)
			},
		)
}
