import type { InfraProvider } from '@coploy/infra'
import type { Company } from '@coploy/domain'

/**
 * Superfície do contrato público (ADR-003). Declarar `'x-surface'` no schema
 * da rota a INCLUI no `openapi.public.json`; ausência = rota interna
 * (fail-closed). Ver docs/talent-os/v2/contrato-publico-core.md.
 */
type ContractSurface = 'empresa' | 'candidato' | 'publico' | 'integracoes'

declare module 'fastify' {
	interface FastifyInstance {
		infra: InfraProvider
	}
	interface FastifySchema {
		'x-surface'?: ContractSurface
		/** Rota que só existe/funciona num provider de infra específico. */
		'x-infra-dependent'?: 'selfhosted' | 'gcp'
	}
	interface FastifyRequest {
		getCurrentUser: () => Promise<string>
		getUserMembership: () => Promise<{ company: Company }>
		getAccessToken: () => Promise<string>
		validateApiKey?: () => Promise<void>
		requireActiveSubscription: () => Promise<{
			company: Company
			hasActiveSubscription: boolean
		}>
		requireTrialOrActiveSubscription: () => Promise<{
			company: Company
			hasValidSubscription: boolean
		}>
		checkPlanLimits: (
			feature: string,
			currentUsage: number,
		) => Promise<{
			allowed: boolean
			limit: number
			current: number
			remaining?: number
		}>
	}
}
