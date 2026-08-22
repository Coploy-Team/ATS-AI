import type { Company } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import { fastifyPlugin } from 'fastify-plugin'

import { createBillingFirestoreService } from '@/lib/billing-firestore'
import { UnauthorizedError } from '@coploy/shared/errors'

export const requireActiveSubscription = fastifyPlugin(
	async (app: FastifyInstance) => {
		const billingFirestore = createBillingFirestoreService(app.infra)
		app.addHook('preHandler', async (request) => {
			request.requireActiveSubscription = async () => {
				// Primeiro, obter dados da empresa
				const { company } = await request.getUserMembership()

				// Verificar se tem subscription ativa
				const hasActiveSubscription =
					await billingFirestore.hasActiveSubscription(company.id)

				if (!hasActiveSubscription) {
					throw new UnauthorizedError(
						'Esta funcionalidade requer uma subscription ativa',
					)
				}

				return { company, hasActiveSubscription: true }
			}
		})
	},
)

export const requireTrialOrActiveSubscription = fastifyPlugin(
	async (app: FastifyInstance) => {
		app.addHook('preHandler', async (request) => {
			request.requireTrialOrActiveSubscription = async () => {
				// Primeiro, obter dados da empresa
				const { company } = await request.getUserMembership()

				// Verificar se tem subscription ativa ou está em trial
				const activeStatuses = ['active', 'trialing']
				const companyTyped = company as unknown as { subscriptionStatus?: string | null }
					const hasValidSubscription =
					companyTyped.subscriptionStatus != null &&
					activeStatuses.includes(companyTyped.subscriptionStatus)

				if (!hasValidSubscription) {
					throw new UnauthorizedError(
						'Esta funcionalidade requer uma subscription ativa ou período de trial',
					)
				}

				return { company, hasValidSubscription: true }
			}
		})
	},
)

// Middleware para verificar limites baseados no plano
export const checkPlanLimits = fastifyPlugin(async (app: FastifyInstance) => {
	app.addHook('preHandler', async (request) => {
		request.checkPlanLimits = async (feature: string, currentUsage: number) => {
			const { company } = await request.getUserMembership()

			// Definir limites por plano (você pode mover isso para uma config)
			const planLimits: Record<string, Record<string, number>> = {
				free: {
					interviews: 5,
					jobs: 2,
					collaborators: 1,
				},
				pro: {
					interviews: 100,
					jobs: 50,
					collaborators: 10,
				},
				enterprise: {
					interviews: -1, // Ilimitado
					jobs: -1,
					collaborators: -1,
				},
			}

			const currentPlan = (company as Company).subscriptionPlan || 'free'
			const limits = planLimits[currentPlan] ?? planLimits['free']!
			const featureLimit = limits[feature] ?? 0

			// -1 significa ilimitado
			if (featureLimit === -1) {
				return { allowed: true, limit: -1, current: currentUsage }
			}

			const allowed = currentUsage < featureLimit

			if (!allowed) {
				throw new UnauthorizedError(
					`Limite do plano atingido. Seu plano ${currentPlan} permite apenas ${featureLimit} ${feature}`,
				)
			}

			return {
				allowed,
				limit: featureLimit,
				current: currentUsage,
				remaining: featureLimit - currentUsage,
			}
		}
	})
})
