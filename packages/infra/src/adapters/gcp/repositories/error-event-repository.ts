import type { Firestore, Query } from 'firebase-admin/firestore'
import type { ErrorEventRepository } from '../../../interfaces/repositories/error-event-repository'
import type { ErrorEvent } from '@coploy/domain'
import { ErrorEventRepositorySchema } from '../../shared/repository-schemas'
import { mapDocsWithSchema, normalizeDoc } from './helpers'

const COLLECTION = 'errorEvents'

export function createFirestoreErrorEventRepository(
	db: Firestore,
): ErrorEventRepository {
	return {
		async listAll(opts) {
			const limit = opts?.limit ?? 100
			try {
				let q: Query = db.collection(COLLECTION).orderBy('createdAt', 'desc')
				if (typeof opts?.resolved === 'boolean') q = q.where('resolved', '==', opts.resolved)
				if (opts?.companyId) q = q.where('companyId', '==', opts.companyId)
				if (opts?.interviewId) q = q.where('interviewId', '==', opts.interviewId)
				if (opts?.service) q = q.where('service', '==', opts.service)
				const snapshot = await q.limit(limit).get()
				return mapDocsWithSchema<ErrorEvent>(snapshot, ErrorEventRepositorySchema)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					console.warn('[ErrorEvent] listAll index not ready, returning empty list')
					return []
				}
				throw err
			}
		},
		async listByCompany(companyId, limit = 50) {
			try {
				const snapshot = await db
					.collection(COLLECTION)
					.where('companyId', '==', companyId)
					.orderBy('createdAt', 'desc')
					.limit(limit)
					.get()
				return mapDocsWithSchema<ErrorEvent>(snapshot, ErrorEventRepositorySchema)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					console.warn('[ErrorEvent] listByCompany index not ready, returning empty list')
					return []
				}
				throw err
			}
		},
		async listByInterview(interviewId, limit = 50) {
			try {
				const snapshot = await db
					.collection(COLLECTION)
					.where('interviewId', '==', interviewId)
					.orderBy('createdAt', 'desc')
					.limit(limit)
					.get()
				return mapDocsWithSchema<ErrorEvent>(snapshot, ErrorEventRepositorySchema)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					console.warn('[ErrorEvent] listByInterview index not ready, returning empty list')
					return []
				}
				throw err
			}
		},
		async getById(id) {
			const doc = await db.collection(COLLECTION).doc(id).get()
			if (!doc.exists) return null
			const data = doc.data()
			return normalizeDoc({ ...data, id: doc.id }) as unknown as ErrorEvent
		},
		async create(data) {
			const now = new Date().toISOString()
			const payload = {
				...data,
				resolved: data.resolved ?? false,
				createdAt: now,
			}
			const ref = await db.collection(COLLECTION).add(payload)
			return normalizeDoc({ ...payload, id: ref.id }) as unknown as ErrorEvent & { id: string }
		},
		async markResolved(id, resolvedBy) {
			await db.collection(COLLECTION).doc(id).update({
				resolved: true,
				resolvedAt: new Date().toISOString(),
				resolvedBy,
			})
		},
		async count(filters) {
			let q: Query = db.collection(COLLECTION)
			if (typeof filters?.resolved === 'boolean') q = q.where('resolved', '==', filters.resolved)
			if (filters?.companyId) q = q.where('companyId', '==', filters.companyId)
			if (filters?.interviewId) q = q.where('interviewId', '==', filters.interviewId)
			if (filters?.service) q = q.where('service', '==', filters.service)
			try {
				const snap = await q.count().get()
				return snap.data().count
			} catch (err: unknown) {
				if ((err as { code?: number })?.code === 9) {
					console.warn('[ErrorEvent] count index not ready, returning null')
					return null
				}
				throw err
			}
		},
	}
}
