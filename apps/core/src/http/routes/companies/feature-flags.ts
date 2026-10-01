import { FEATURE_FLAG_KEYS } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createFeatureFlagsService } from '@/lib/services/feature-flags-service'

/**
 * As opções que a EMPRESA liga ou desliga em si mesma.
 *
 * Escrever flag era exclusivo do console interno da Coploy. Isso funcionava
 * enquanto elas eram experimentos nossos — mas `jobRequisition` decide se a
 * empresa exige pedido aprovado antes de abrir vaga, e isso é decisão de quem
 * contrata, não nossa.
 *
 * E na distribuição aberta não existe console interno: sem esta rota, ninguém
 * conseguiria ligar a aprovação de vagas em lugar nenhum.
 */
export function companyFeatureFlagsRoutes(app: FastifyInstance) {
	const svc = createFeatureFlagsService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/feature-flags',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Optional behaviours this company has turned on',
					response: {
						200: z.object({
							companyId: z.string(),
							featureFlags: z.record(z.string(), z.boolean()),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return svc.getCompanyFeatureFlags(company.id)
			},
		)
		.put(
			'/companies/feature-flags',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'Turn optional behaviours on or off',
					body: z
						.object(
							Object.fromEntries(
								FEATURE_FLAG_KEYS.map((key) => [key, z.boolean().optional()]),
							) as Record<string, z.ZodOptional<z.ZodBoolean>>,
						)
						/*
						 * Parcial de propósito: a tela manda só a chave que mudou. Mandar
						 * o mapa inteiro faria duas pessoas editando ao mesmo tempo
						 * apagarem a decisão uma da outra.
						 */
						.partial(),
					response: {
						200: z.object({
							companyId: z.string(),
							featureFlags: z.record(z.string(), z.boolean()),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return svc.updateCompanyFeatureFlags(
					company.id,
					request.body as Record<string, boolean>,
				)
			},
		)
}
