import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { REJECTION_REASON_TAXONOMY_VERSION, REJECTION_REASONS } from '@coploy/domain'
import { createAuth } from '@/http/routes/middlewares/auth'

/**
 * Taxonomia de motivos de reprovação (TOS-018) pelo contrato.
 *
 * Por que existe: o `web/dashboard` importa `REJECTION_REASONS` direto de
 * `@coploy/domain`, mas o `web/ats` **não pode** importar pacote privado do
 * monorepo . Duplicar a lista no cliente criaria drift num dado
 * que é PERSISTIDO (`rejectionReasonCode`) e governa o que o candidato vê —
 * então ela vem da mesma fonte que o core usa pra validar.
 */
export function getRejectionReasons(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/rejection-reasons',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['companies'],
					security: [{ bearerAuth: [] }],
					summary: 'List the typed rejection reason taxonomy',
					description:
						'Motivos de reprovação tipados. `requiresNote` obriga nota interna; ' +
						'`candidateVisibility` diz o que o candidato enxerga (hidden | generic | specific).',
					response: {
						200: z.object({
							version: z.string(),
							reasons: z.array(
								z.object({
									code: z.string(),
									label: z.string(),
									requiresNote: z.boolean().optional(),
									requiresEvidence: z.boolean().optional(),
									candidateVisibility: z.enum(['hidden', 'generic', 'specific']),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				// `createAuth` é LAZY: ele só instala os helpers no request e a
				// validação acontece quando alguém chama um deles. Sem esta linha a
				// rota respondia 200 sem token — confirmado em homolog.
				await request.getUserMembership()
				return {
					version: REJECTION_REASON_TAXONOMY_VERSION,
					reasons: REJECTION_REASONS,
				}
			},
		)
}
