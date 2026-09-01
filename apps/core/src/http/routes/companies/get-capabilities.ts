import { TENANT_ROLES, capabilitiesOf, normalizeTenantRole } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { findCollaborator } from '@/lib/collaborator-identity'
import { getInstallationFeatures } from '@/lib/installation-features'

/**
 * O que ESTE usuário pode fazer nesta empresa (V2-301).
 *
 * A UI precisa disso para não oferecer ação que o backend vai negar — botão que
 * some é melhor que botão que dá erro. E é a mesma fonte do guard, então tela e
 * API não podem divergir: ambas leem a matriz de `@coploy/domain`.
 */
export function getCapabilities(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/capabilities',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Capabilities of the current user in this company',
					response: {
						200: z.object({
							role: z.string(),
							capabilities: z.array(z.string()),
							/** `false` enquanto o RBAC roda em shadow (só registra). */
							enforcing: z.boolean(),
							/*
							 * A matriz INTEIRA: papel → o que ele pode.
							 *
							 * A tela de Time precisa explicar cada papel para quem vai
							 * escolher um, e o ATS é proibido de importar `@coploy/domain`
							 * (guard de imports). Copiar a matriz para o cliente a faria
							 * apodrecer na primeira capability nova — então ela desce daqui,
							 * da mesma fonte que o guard usa.
							 */
							roles: z.array(
								z.object({
									role: z.string(),
									capabilities: z.array(z.string()),
								}),
							),
							/*
							 * O que esta INSTALAÇÃO oferece : SaaS/enterprise
							 * tem tudo; a distribuição open não tem hunting nem billing,
							 * e o Motor depende do plugin. A UI esconde superfícies que
							 * a edição não tem — menu para tela vazia é porta pintada.
							 */
							features: z.object({
								motor: z.boolean(),
								hunting: z.boolean(),
								billing: z.boolean(),
								integrations: z.boolean(),
								instanceConfig: z.boolean(),
								whatsapp: z.boolean(),
							}),
						}),
					},
				},
			},
			async (request) => {
				const { company, user } = (await request.getUserMembership()) as {
					company: { id: string }
					user?: { email?: string | null }
				}
				const userId = await request.getCurrentUser().catch(() => null)

				let accessLevel: string | null = null
				if (userId) {
					try {
						const collaborators = (await app.infra.collaboratorRepository.listCollaborators(
							company.id,
						)) as unknown as Array<Record<string, unknown>>
						/*
						 * MESMO matcher do hook de RBAC. Eram duas cópias, as duas
						 * procurando campos que o documento não tem — então a API
						 * liberava e a tela também. Consertar uma e esquecer a outra
						 * seria pior: a API bloquearia e a interface continuaria
						 * oferecendo o botão.
						 */
						const mine = findCollaborator(
							collaborators,
							userId,
							(user as { email?: string } | null)?.email,
						)
						accessLevel = (mine?.accessLevel as string) ?? null
					} catch {
						accessLevel = null
					}
				}

				const role = normalizeTenantRole(accessLevel)
				return {
					role,
					capabilities: [...capabilitiesOf(role)],
					enforcing: process.env.RBAC_ENFORCE === 'true',
					roles: TENANT_ROLES.map((item) => ({
						role: item,
						capabilities: [...capabilitiesOf(item)],
					})),
					features: getInstallationFeatures(),
				}
			},
		)
}
