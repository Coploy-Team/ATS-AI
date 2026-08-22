import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import {
	CollaboratorSchema,
	type Collaborator as CollaboratorType,
} from '@/schemas/collaborator-schema'
import type { Collaborator } from '@coploy/domain'
import { createCollaboratorService } from '@/lib/services/collaborator-service'

export function createCollaborator(app: FastifyInstance) {
	const collaboratorService = createCollaboratorService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/companies/collaborators',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['collaborators'],
					security: [{ bearerAuth: [] }],
					summary: 'Create a new collaborator',
					body: z.object({
						email: z.string().email(),
						name: z.string(),
						accessLevel: z.enum(['editor', 'shared']),
						status: z.boolean(),
						password: z.string(),
					}),
					response: {
						201: z.object({
							collaborator: CollaboratorSchema,
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const data = request.body

				// 1. Criar usuario no Firebase Auth usando Admin SDK
				const userRecord = await collaboratorService.createUser({
					email: data.email,
					password: data.password,
					displayName: data.name,
				})

				// 2. Criar registro na colecao userCompany
				const userCompanyData: Record<string, unknown> = {
					email: data.email,
					display_name: data.name,
					is_owner: (data.accessLevel as string) === 'owner',
					created_time: new Date(),
					company: { id: company.id },
				}

				await collaboratorService.createUsersCompany(
					userCompanyData,
					userRecord.uid,
				)

				// 3. Criar colaborador na subcolecao
				const collaboratorData: Omit<CollaboratorType, 'id'> = {
					accessLevel: data.accessLevel,
					name: data.name,
					email: data.email,
					status: data.status,
					creationDate: new Date(),
					userRef: { id: userRecord.uid },
				}

				const collaborator = await collaboratorService.createCollaborator(
					company.id,
					collaboratorData,
				) as unknown as (Collaborator & { id: string })
				const rawDate = collaborator.creationDate as Date | { toDate?: () => Date }
				const collaboratorWithId: CollaboratorType = {
					id: collaborator.id,
					userRef: userRecord.uid,
					email: data.email,
					accessLevel: data.accessLevel as 'owner' | 'editor',
					creationDate: typeof (rawDate as { toDate?: () => Date }).toDate === 'function'
						? (rawDate as { toDate: () => Date }).toDate()
						: new Date(rawDate as unknown as string | number),
					name: data.name,
					status: data.status,
				}

				// Email com senha sera enviado futuramente

				return {
					collaborator: collaboratorWithId,
				}
			},
		)
}
