import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { ComparisonOperator } from '@coploy/domain'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import {
	type Collaborator,
	CollaboratorSchema,
} from '@/schemas/collaborator-schema'
import { createCollaboratorService } from '@/lib/services/collaborator-service'

interface FirestoreCollaborator
	extends Omit<Collaborator, 'creationDate' | 'userRef'> {
	creationDate: Date | { toDate?: () => Date }
	userRef: { id?: string; path?: string }
}

const accessLevelEnum = z.enum(['all', 'owner', 'editor'])
const statusEnum = z.enum(['all', 'active', 'inactive'])

type CollaboratorFilter = {
	field: string
	operator: ComparisonOperator
	value: boolean | string
}

export function listCollaborators(app: FastifyInstance) {
	const collaboratorService = createCollaboratorService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/collaborators',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['collaborators'],
					security: [{ bearerAuth: [] }],
					summary: 'List company collaborators',
					description: 'Get collaborators with pagination and filters',
					querystring: z.object({
						page: z.string().default('1').transform(Number),
						limit: z.string().default('10').transform(Number),
						find: z.string().optional(),
						status: statusEnum
							.default('all')
							.describe('Status filter: all, active, or inactive'),
						accessLevel: accessLevelEnum
							.default('all')
							.describe('Access level filter: all, owner, or editor'),
						orderBy: z
							.enum(['name', 'email', 'creationDate'])
							.default('creationDate'),
						orderDirection: z
							.enum(['asc', 'desc'])
							.default('desc')
							.describe('Order direction: asc or desc'),
					}),
					response: {
						200: z.object({
							collaborators: z.array(CollaboratorSchema),
							pagination: z.object({
								total: z.number(),
								page: z.number(),
								totalPages: z.number(),
								hasMore: z.boolean(),
							}),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const currentUserId = await request.getCurrentUser().catch(() => null)
				const {
					page,
					limit,
					find,
					status,
					accessLevel,
					orderBy,
					orderDirection,
				} = request.query

				// Construir os filtros
				const filters: CollaboratorFilter[] = []

				if (status !== 'all') {
					filters.push({
						field: 'status',
						operator: '==',
						value: status === 'active',
					})
				}

				if (accessLevel !== 'all') {
					filters.push({
						field: 'accessLevel',
						operator: '==',
						value: accessLevel,
					})
				}

				// Buscar colaboradores com filtros
				const collaborators =
					await collaboratorService.listCollaborators(
						company.id,
						{
							filters,
							orderByField: orderBy,
							orderDirection: orderDirection as 'asc' | 'desc',
						},
					) as unknown as FirestoreCollaborator[]

				// Processar e filtrar resultados
				const processedCollaborators = collaborators
					.map((collaborator) => ({
						id: collaborator.id,
						accessLevel: collaborator.accessLevel,
						// registro legado pode não ter data; Invalid Date derrubava a lista
						creationDate: collaborator.creationDate
							? (collaborator.creationDate as { toDate?: () => Date }).toDate
								? (collaborator.creationDate as { toDate: () => Date }).toDate()
								: new Date(collaborator.creationDate as unknown as string | number)
							: new Date(0),
						email: collaborator.email,
						name: collaborator.name,
						status: collaborator.status,
						// userRef ausente (registro criado sem vínculo) não pode ser crash
						userRef:
							(collaborator.userRef as { id?: string } | null | undefined)?.id ??
							collaborator.userRef ??
							null,
					}))
					.filter((collaborator) => {
						if (!find) {
							return true
						}

						const searchTerm = find.toLowerCase()
						return (
							collaborator.name.toLowerCase().includes(searchTerm) ||
							collaborator.email.toLowerCase().includes(searchTerm)
						)
					})

				/*
				 * QUEM CRIOU A EMPRESA também é do time.
				 *
				 * O cadastro grava `is_owner: true` no documento do usuário e NÃO
				 * cria colaborador — então quem abre a conta não aparece na própria
				 * tela de Time, que abre dizendo "0 pessoas com acesso". Vale para o
				 * v1 e para o v2: as duas leem esta rota, e as duas já sabem desenhar
				 * a linha de `owner` (a v1 até conta quantos são).
				 *
				 * Sintetizar aqui, e não só no cadastro, cobre as empresas que já
				 * existem sem precisar de backfill. Quem foi convidado tem documento
				 * de colaborador e cai no `find` abaixo, sem duplicar.
				 */
				if (currentUserId) {
					const eu = await collaboratorService.buildSelfCollaborator(currentUserId, {
						accessLevel,
						status,
					})
					/*
					 * Dedup por vínculo OU por e-mail: registro de colaborador sem
					 * `userRef` (convite antigo, ponte do selfhosted ausente) é a MESMA
					 * pessoa quando o e-mail bate — só o vínculo fazia o dono aparecer
					 * duas vezes na tela de Time da distribuição open.
					 */
					const jaEstaNaLista = processedCollaborators.some(
						(item) =>
							item.userRef === currentUserId ||
							(eu?.email &&
								item.email?.toLowerCase() === eu.email.toLowerCase()),
					)

					if (eu && !jaEstaNaLista) processedCollaborators.unshift(eu)
				}

				// Calcular paginação
				const total = processedCollaborators.length
				const totalPages = Math.ceil(total / limit)
				const startIndex = (page - 1) * limit
				const paginatedCollaborators = processedCollaborators.slice(
					startIndex,
					startIndex + limit,
				)

				return {
					collaborators: paginatedCollaborators,
					pagination: {
						total,
						page,
						totalPages,
						hasMore: page < totalPages,
					},
				}
			},
		)
}
