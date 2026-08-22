import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAccountRecoveryService } from '@/lib/services/account-recovery-service'

/**
 * Recuperação de acesso (V2-703).
 *
 * Pública por necessidade: quem chama perdeu o acesso, então não há como exigir
 * sessão. A proteção é a resposta ser sempre idêntica — a rota não confirma nem
 * nega a existência da conta.
 */
export function recoveryRoutes(app: FastifyInstance) {
	const service = createAccountRecoveryService(app.infra)

	app.withTypeProvider<ZodTypeProvider>().post(
		'/auth/recovery/request',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['auth'],
				summary: 'Inicia recuperação de acesso por canal alternativo',
				description:
					'A resposta é a mesma exista ou não conta com esse CPF — a rota não é oráculo ' +
					'de "este CPF tem cadastro aqui".',
				body: z.object({
					cpf: z.string().min(11).max(14),
					channel: z.enum(['email', 'phone']),
					contact: z.string().min(5).max(200),
				}),
				response: {
					200: z.object({ ok: z.boolean(), message: z.string() }),
				},
			},
		},
		async (request) => service.requestRecovery(request.body),
	)
}
