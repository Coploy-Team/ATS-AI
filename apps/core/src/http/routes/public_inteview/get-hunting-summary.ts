import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'

const responseSchema = z.object({
	totalUnlocks: z.number().describe('Total de candidatos desbloqueados pela empresa via hunting (creditsUsed.isHunting=true).'),
	monthUnlocks: z.number().describe('Desbloqueios do mês corrente (1º dia até agora).'),
})

/**
 * Resumo de uso do hunting pela empresa logada — alimenta o card no dashboard
 * "Você desbloqueou X candidatos". Card aparece só pra planos SaaS (frontend
 * checa `subscriptionPlan !== 'enterprise'`).
 */
export function getHuntingSummary(app: FastifyInstance) {
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/public_interviews/summary',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['public_interviews'],
					security: [{ bearerAuth: [] }],
					summary: 'Resumo de unlocks de hunting da empresa logada',
					response: { 200: responseSchema },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()

				const credits = await app.infra.billingRepository.listCreditsUsed(company.id, {
					filters: [{ field: 'isHunting', operator: '==', value: true }],
					limitTo: 5000,
				})

				// Mês corrente — calculado em UTC pra ficar simples (TZ específica
				// faria diferença de no máximo 1 doc na borda do dia, irrelevante
				// pro card de "uso").
				const now = new Date()
				const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

				const monthUnlocks = credits.filter((c) => {
					const usedAt = c.usedAt ? new Date(c.usedAt) : null
					return usedAt instanceof Date && usedAt >= startOfMonth
				}).length

				return {
					totalUnlocks: credits.length,
					monthUnlocks,
				}
			},
		)
}
