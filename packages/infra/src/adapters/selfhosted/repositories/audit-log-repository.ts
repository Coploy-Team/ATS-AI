import type { AuditLogRepository } from '../../../interfaces/repositories/audit-log-repository'
import type { DrizzleDb } from '../db/client'

// Audit log é GCP-only na Fase 4. Stub silencioso para selfhosted —
// create vira no-op (não bloqueia) e list retorna vazio.
export function createDrizzleAuditLogRepository(_db: DrizzleDb): AuditLogRepository {
	return {
		async create(data) {
			return { ...data, id: 'noop' } as never
		},
		async list() {
			return []
		},
	}
}
