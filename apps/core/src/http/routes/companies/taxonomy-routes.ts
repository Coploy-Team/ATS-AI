import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { normalizeTerm } from '@coploy/domain'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createTaxonomyService } from '@/lib/services/taxonomy-service'

/**
 * Taxonomia para a UI (V2-802 / V2-804).
 *
 * Só leitura: a carga é script, não rota. Expor escrita aqui deixaria a
 * taxonomia — que é dado público e compartilhado entre tenants — editável por
 * qualquer empresa.
 */
export function taxonomyRoutes(app: FastifyInstance) {
	const taxonomy = createTaxonomyService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/taxonomy/occupations/resolve',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['taxonomy'],
					security: [{ bearerAuth: [] }],
					summary: 'Resolve um cargo em texto livre para a ocupação canônica',
					description:
						'Casamento determinístico (exato → contido → distância de edição). Abaixo do ' +
						'limiar devolve null em vez de chutar.',
					querystring: z.object({ q: z.string().min(1).max(200) }),
					response: {
						200: z.object({
							match: z
								.object({
									id: z.string(),
									code: z.string(),
									title: z.string(),
									confidence: z.number(),
									matchedOn: z.string(),
									taxonomyVersion: z.string(),
								})
								.nullable(),
						}),
					},
				},
			},
			async (request) => {
				await request.getUserMembership()
				const match = await taxonomy.resolveOccupation(request.query.q)
				return {
					match: match
						? {
								id: match.occupation.id,
								code: match.occupation.code,
								title: match.occupation.title,
								confidence: match.confidence,
								matchedOn: match.matchedOn,
								taxonomyVersion: match.occupation.taxonomyVersion,
							}
						: null,
				}
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/taxonomy/skills',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['taxonomy'],
					security: [{ bearerAuth: [] }],
					summary: 'Busca skills canônicas para autocomplete',
					querystring: z.object({
						q: z.string().max(80).optional(),
						limit: z.coerce.number().int().min(1).max(50).optional(),
					}),
					response: {
						200: z.object({
							skills: z.array(
								z.object({
									id: z.string(),
									name: z.string(),
									category: z.string().nullable(),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				await request.getUserMembership()
				const all = await app.infra.taxonomyRepository.listSkills().catch(() => [])
				const needle = normalizeTerm(request.query.q ?? '')

				const matches = all
					// skill pendente de curadoria não é sugestão: ainda não é canônica
					.filter((skill) => skill.pendingCuration !== true)
					.filter((skill) => {
						if (!needle) return true
						const haystack = [skill.name, ...(skill.synonyms ?? [])].map(normalizeTerm)
						return haystack.some((term) => term.includes(needle))
					})
					// prefixo antes de contido: quem digita "re" quer React, não "Core"
					.sort((a, b) => {
						const aStarts = normalizeTerm(a.name).startsWith(needle) ? 0 : 1
						const bStarts = normalizeTerm(b.name).startsWith(needle) ? 0 : 1
						return aStarts - bStarts || a.name.localeCompare(b.name)
					})
					.slice(0, request.query.limit ?? 20)

				return {
					skills: matches.map((skill) => ({
						id: skill.id,
						name: skill.name,
						category: skill.category ?? null,
					})),
				}
			},
		)
}
