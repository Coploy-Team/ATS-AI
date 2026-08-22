import type { EnterpriseContractRepository } from '../../../interfaces/repositories/enterprise-contract-repository'
import type { DrizzleDb } from '../db/client'

// Admin-only feature is GCP-scoped in Phase 1. Selfhosted stub throws at runtime —
// once there's selfhosted demand we'll wire a proper Drizzle adapter + schema.
export function createDrizzleEnterpriseContractRepository(
	_db: DrizzleDb,
): EnterpriseContractRepository {
	const notSupported = () => {
		throw new Error(
			'[selfhosted] enterpriseContractRepository not implemented — use GCP adapter for admin console',
		)
	}
	return {
		async list() {
			return notSupported()
		},
		async getById() {
			return notSupported()
		},
		async listByCompany() {
			return notSupported()
		},
		async create() {
			return notSupported()
		},
		async update() {
			return notSupported()
		},
		async delete() {
			return notSupported()
		},
	}
}
