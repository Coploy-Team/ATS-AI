import type { AdminUserRepository } from '../../../interfaces/repositories/admin-user-repository'
import type { DrizzleDb } from '../db/client'

// Admin-only feature is GCP-scoped in Phase 1. Selfhosted stub throws at runtime —
// once there's selfhosted demand we'll wire a proper Drizzle adapter + schema.
export function createDrizzleAdminUserRepository(_db: DrizzleDb): AdminUserRepository {
	const notSupported = () => {
		throw new Error('[selfhosted] adminUserRepository not implemented — use GCP adapter for admin console')
	}
	return {
		async getByEmail() {
			return notSupported()
		},
		async list() {
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
