import type { InfraProvider } from '@coploy/infra'
import type { Company, CompanyFeatureFlags, FeatureFlagKey } from '@coploy/domain'
import { FEATURE_FLAG_KEYS } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'
import { isFeatureEnabled } from '@/lib/feature-flags'

export type FeatureFlagsResponse = {
	companyId: string
	featureFlags: Record<FeatureFlagKey, boolean>
}

function normalizeFlags(
	flags: CompanyFeatureFlags | null | undefined,
): Record<FeatureFlagKey, boolean> {
	const out = {} as Record<FeatureFlagKey, boolean>
	for (const key of FEATURE_FLAG_KEYS) {
		out[key] = flags?.[key] === true
	}
	return out
}

/**
 * Admin + leitura tipada de feature flags por tenant.
 * Espelha o padrão factory de admin-company-actions-service.
 */
export function createFeatureFlagsService(infra: InfraProvider) {
	return {
		async getCompanyFeatureFlags(companyId: string): Promise<FeatureFlagsResponse> {
			const company = await infra.companyRepository.getCompany(companyId)
			if (!company) throw new NotFoundError('Company not found')
			return {
				companyId,
				featureFlags: normalizeFlags(company.featureFlags),
			}
		},

		/**
		 * Merge parcial das flags. Chaves omitidas preservam o valor atual.
		 * Reconstrói só FeatureFlagKey — chaves fora do union (ex.: SQL manual) são limpas.
		 */
		async updateCompanyFeatureFlags(
			companyId: string,
			patch: CompanyFeatureFlags,
		): Promise<FeatureFlagsResponse> {
			const company = await infra.companyRepository.getCompany(companyId)
			if (!company) throw new NotFoundError('Company not found')

			const next: CompanyFeatureFlags = {}
			for (const key of FEATURE_FLAG_KEYS) {
				const value = patch[key] !== undefined ? patch[key] : company.featureFlags?.[key]
				if (value !== undefined) {
					next[key] = value === true
				}
			}

			await infra.companyRepository.updateCompany(companyId, {
				featureFlags: next,
			} as Partial<Company>)

			return {
				companyId,
				featureFlags: normalizeFlags(next),
			}
		},

		/** Exposto para testes / callers que já têm o Company em mão. */
		isEnabled(company: Pick<Company, 'featureFlags'> | null | undefined, flag: FeatureFlagKey) {
			return isFeatureEnabled(company, flag)
		},
	}
}

export function assertKnownFeatureFlagKeys(patch: Record<string, unknown>): CompanyFeatureFlags {
	const out: CompanyFeatureFlags = {}
	for (const [key, value] of Object.entries(patch)) {
		if (!(FEATURE_FLAG_KEYS as readonly string[]).includes(key)) {
			throw new BadRequestError(`Unknown feature flag key: ${key}`)
		}
		if (typeof value !== 'boolean') {
			throw new BadRequestError(`featureFlags.${key} must be boolean`)
		}
		out[key as FeatureFlagKey] = value
	}
	return out
}
