import type { Firestore, Query } from 'firebase-admin/firestore'
import type { AuditLog } from '@coploy/domain'
import type { AuditLogRepository } from '../../../interfaces/repositories/audit-log-repository'
import { AuditLogRepositorySchema } from '../../shared/repository-schemas'
import { mapDocsWithSchema, normalizeDoc } from './helpers'

export function createFirestoreAuditLogRepository(db: Firestore): AuditLogRepository {
	const COLLECTION = 'auditLogs'

	return {
		async create(data) {
			const payload = { ...data, at: data.at instanceof Date ? data.at : new Date() }
			const ref = await db.collection(COLLECTION).add(payload)
			return normalizeDoc({ ...payload, id: ref.id }) as unknown as AuditLog & { id: string }
		},

		async list(opts) {
			const limit = opts?.limit ?? 200
			try {
				let q: Query = db.collection(COLLECTION).orderBy('at', 'desc')
				if (opts?.actor) q = q.where('actor', '==', opts.actor)
				if (opts?.action) q = q.where('action', '==', opts.action)
				if (opts?.scope) q = q.where('scope', '==', opts.scope)
				if (opts?.targetType) q = q.where('targetType', '==', opts.targetType)
				if (opts?.targetId) q = q.where('targetId', '==', opts.targetId)
				const snap = await q.limit(limit).get()
				return mapDocsWithSchema<AuditLog>(snap, AuditLogRepositorySchema)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					console.warn('[AuditLog] index not ready, returning empty list')
					return []
				}
				throw err
			}
		},
	}
}
