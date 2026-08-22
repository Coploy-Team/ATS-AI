import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import z from 'zod'

import type { UsersCompany } from '@coploy/domain'
import { UnauthorizedError } from '@coploy/shared/errors'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createAuthService } from '@/lib/services/auth-service'

/**
 * O recrutador editando o próprio cadastro.
 *
 * ## Por que uma rota nova
 *
 * `POST /auth/update-profile` já existia e faz quase isto — mas é da superfície
 * **candidato**, e o payload dela é currículo (ocupação, países de interesse,
 * objetivos). O ATS não pode chamá-la (o SDK sequer a expõe em `empresa`), e
 * marcar a mesma rota nas duas superfícies significaria oferecer campos de
 * currículo a quem é recrutador. São dois cadastros diferentes com o mesmo
 * nome.
 *
 * Aqui é o mínimo que a pessoa precisa mudar sozinha: como ela se chama, a
 * foto e o telefone. Cargo, empresa e nível de acesso continuam sendo de quem
 * administra a conta — não é o usuário que se promove.
 */
export function updateProfileEmpresa(app: FastifyInstance) {
	const authService = createAuthService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.patch(
			'/profile',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['auth'],
					summary: 'Update the authenticated recruiter profile',
					security: [{ bearerAuth: [] }],
					body: z.object({
						name: z.string().trim().min(1).max(120).optional(),
						photoUrl: z.string().url().max(2048).nullable().optional(),
						phoneNumber: z.string().trim().max(40).nullable().optional(),
					}),
					response: {
						200: z.object({
							user: z.object({
								id: z.string(),
								name: z.string().nullable(),
								email: z.string(),
								avatarUrl: z.string().nullable(),
								phoneNumber: z.string().nullable(),
							}),
						}),
						401: z.object({ message: z.string() }),
					},
				},
			},
			async (request, reply) => {
				const userId = await request.getCurrentUser()
				// membership confere que quem edita pertence a uma empresa
				await request.getUserMembership()

				const current = (await authService.getUsersCompany(userId)) as UsersCompany | null
				if (!current) return new UnauthorizedError()

				const { name, photoUrl, phoneNumber } = request.body

				/*
				 * Só o que veio no corpo é gravado. PATCH parcial é o que permite a
				 * tela salvar um campo sem reenviar (e sem apagar) o resto — mandar o
				 * objeto inteiro é como um formulário de um campo zera os outros dois.
				 */
				const patch: Record<string, unknown> = {}
				if (name !== undefined) patch.display_name = name
				if (photoUrl !== undefined) patch.photo_url = photoUrl
				if (phoneNumber !== undefined) patch.phone_number = phoneNumber

				if (Object.keys(patch).length > 0) {
					await app.infra.userRepository.updateUsersCompany(userId, patch)
				}

				/*
				 * ESPELHO no colaborador.
				 *
				 * O nome vive em dois lugares: `users/{uid}` (a identidade) e
				 * `companies/{id}/collaborators/{doc}` (a lista do Time, que guarda a
				 * própria cópia). Sem espelhar, a pessoa mudava o nome e continuava
				 * aparecendo como o antigo para os colegas — sem nenhum aviso de que
				 * havia dois cadastros.
				 *
				 * Espelho é derivado: se falhar, a identidade já está gravada e o
				 * request não pode virar erro por causa da cópia.
				 */
				if (name !== undefined) {
					try {
						const { company } = await request.getUserMembership()
						const collaborators = (await app.infra.collaboratorRepository.listCollaborators(
							company.id,
						)) as unknown as Array<Record<string, unknown>>
						const mine = collaborators.find(
							(item) =>
								item.user_company_id === userId ||
								item.userRef?.toString?.() === userId ||
								(item.userRef as { id?: string } | null)?.id === userId ||
								item.id === userId ||
								item.email === current.email,
						)
						if (mine?.id) {
							await app.infra.collaboratorRepository.updateCollaborator(
								company.id,
								String(mine.id),
								{ name } as never,
							)
						}
					} catch (error) {
						console.warn(
							JSON.stringify({ tag: 'profile.collaboratorMirrorFailed', userId, error: String(error) }),
						)
					}
				}

				const next = (await authService.getUsersCompany(userId)) as UsersCompany | null
				const record = (next ?? current) as unknown as Record<string, unknown>

				return reply.status(200).send({
					user: {
						id: userId,
						name:
							(record.display_name as string) ||
							[record.first_name, record.last_name].filter(Boolean).join(' ') ||
							null,
						email: (record.email as string) ?? '',
						avatarUrl: (record.photo_url as string) ?? null,
						phoneNumber: (record.phone_number as string) ?? null,
					},
				})
			},
		)
}
