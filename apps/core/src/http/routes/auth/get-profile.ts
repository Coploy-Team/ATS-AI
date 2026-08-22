import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import z from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import type { UsersCompany, Company } from '@coploy/domain'
import { UnauthorizedError } from '@coploy/shared/errors'
import { createAuthService } from '@/lib/services/auth-service'

export function getProfile(app: FastifyInstance) {
	const authService = createAuthService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/profile',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['auth'],
					summary: 'Get authenticated user profile',
					security: [{ bearerAuth: [] }],
					response: {
						/**
						 * `user` é a PESSOA e `company` é a empresa.
						 *
						 * Antes o bloco chamado `user` vinha preenchido com
						 * `companyName` e `companLogo` — ou seja, a rota de perfil
						 * devolvia a identidade da empresa vestida de usuário. Na tela
						 * isso aparecia como um perfil com o nome e o logo da empresa
						 * enquanto a topbar mostrava as iniciais da pessoa: duas
						 * identidades divergentes para a mesma sessão.
						 */
						200: z.object({
							user: z.object({
								id: z.string(),
								name: z.string().nullable(),
								email: z.string().email(),
								avatarUrl: z.string().nullable(),
								slug: z.string(),
							}),
							company: z.object({
								id: z.string(),
								name: z.string().nullable(),
								logoUrl: z.string().nullable(),
							}),
						}),
						401: z.object({}),
					},
				},
			},
			async (request, reply) => {
				const sub = await request.getCurrentUser()
				const user = await authService.getUsersCompany(sub) as UsersCompany | null
				if (!user) {
					return new UnauthorizedError()
				}

				const { company } = await request.getUserMembership()
				if (!company) {
					return new UnauthorizedError()
				}

				const companyData = company as unknown as Company
				const fullName =
					user.display_name ||
					[user.first_name, user.last_name].filter(Boolean).join(' ') ||
					null

				return reply.status(200).send({
					user: {
						id: sub,
						name: fullName,
						email: user.email ?? '',
						avatarUrl: user.photo_url ?? null,
						slug: company.id,
					},
					company: {
						id: company.id,
						name: companyData.companyName ?? null,
						logoUrl: companyData.companLogo ?? null,
					},
				})
			},
		)
}
