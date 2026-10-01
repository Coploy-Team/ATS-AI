import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createImportService } from '@/lib/services/import-service'

const bodySchema = z.object({
	kind: z.enum(['jobs', 'candidates']),
	/** Conteúdo do CSV. Arquivo vai como texto: o volume de migração cabe. */
	content: z.string().min(1).max(5_000_000),
})

const errorSchema = z.object({
	line: z.number(),
	field: z.string().nullable(),
	message: z.string(),
})

/**
 * Importação por CSV (V2-605).
 *
 * Duas rotas em vez de uma com flag: preview e commit têm consequências
 * diferentes, e um `dryRun: false` esquecido no cliente grava a base do cliente
 * inteira sem que ninguém tenha decidido isso.
 */
export function importRoutes(app: FastifyInstance) {
	const service = createImportService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/settings/import/preview',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Valida um CSV de migração sem gravar nada',
					body: bodySchema,
					response: {
						200: z.object({
							kind: z.string(),
							totalRows: z.number(),
							valid: z.number(),
							invalid: z.number(),
							updates: z.number(),
							creates: z.number(),
							errors: z.array(errorSchema),
							sample: z.array(z.record(z.string(), z.string())),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return service.preview({ companyId: company.id, ...request.body })
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/settings/import/commit',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Grava um CSV de migração (idempotente por externalId)',
					body: bodySchema,
					response: {
						200: z.object({
							kind: z.string(),
							created: z.number(),
							updated: z.number(),
							failed: z.number(),
							errors: z.array(errorSchema),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return service.commit({ companyId: company.id, ...request.body })
			},
		)
}
