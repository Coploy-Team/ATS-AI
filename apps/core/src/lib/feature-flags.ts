import type { Company, FeatureFlagKey } from '@coploy/domain'

/**
 * Leitura segura de feature flag por tenant.
 * Ausência do objeto, da chave ou valor falsy → false (default OFF).
 * Consumidores devem usar este helper — nunca ler `company.featureFlags` cru.
 */
export function isFeatureEnabled(
	company: Pick<Company, 'featureFlags'> | null | undefined,
	flag: FeatureFlagKey,
): boolean {
	if (!company?.featureFlags) return false
	return company.featureFlags[flag] === true
}
