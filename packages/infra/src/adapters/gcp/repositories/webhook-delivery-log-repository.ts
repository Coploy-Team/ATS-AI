import type { Firestore, Query } from 'firebase-admin/firestore'
import type { WebhookDeliveryLogRepository } from '../../../interfaces/repositories/webhook-delivery-log-repository'
import type { WebhookDeliveryLog } from '@coploy/domain'
import { WebhookDeliveryLogRepositorySchema } from '../../shared/repository-schemas'
import { mapDocsWithSchema, normalizeDoc } from './helpers'

export function createFirestoreWebhookDeliveryLogRepository(
	db: Firestore,
): WebhookDeliveryLogRepository {
	return {
		async listByCompany(companyId, limit = 20) {
			try {
				const snapshot = await db
					.collection('webhookDeliveryLogs')
					.where('companyId', '==', companyId)
					.orderBy('createdAt', 'desc')
					.limit(limit)
					.get()
				return mapDocsWithSchema<WebhookDeliveryLog>(snapshot, WebhookDeliveryLogRepositorySchema)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					// FAILED_PRECONDITION — Firestore composite index not yet created
					console.warn('[WebhookDeliveryLog] Firestore index not ready, returning empty list')
					return []
				}
				throw err
			}
		},
		async listByWebhook(webhookId, limit = 20) {
			try {
				const snapshot = await db
					.collection('webhookDeliveryLogs')
					.where('webhookId', '==', webhookId)
					.orderBy('createdAt', 'desc')
					.limit(limit)
					.get()
				return mapDocsWithSchema<WebhookDeliveryLog>(snapshot, WebhookDeliveryLogRepositorySchema)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					console.warn('[WebhookDeliveryLog] Firestore index not ready, returning empty list')
					return []
				}
				throw err
			}
		},
		async listAll(opts) {
			const limit = opts?.limit ?? 100
			try {
				let q: Query = db.collection('webhookDeliveryLogs').orderBy('createdAt', 'desc')
				if (typeof opts?.success === 'boolean') q = q.where('success', '==', opts.success)
				if (opts?.event) q = q.where('event', '==', opts.event)
				const snapshot = await q.limit(limit).get()
				return mapDocsWithSchema<WebhookDeliveryLog>(snapshot, WebhookDeliveryLogRepositorySchema)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					console.warn('[WebhookDeliveryLog] listAll index not ready, returning empty list')
					return []
				}
				throw err
			}
		},
		async getById(id) {
			const doc = await db.collection('webhookDeliveryLogs').doc(id).get()
			if (!doc.exists) return null
			const data = doc.data()
			return normalizeDoc({ ...data, id: doc.id }) as unknown as WebhookDeliveryLog
		},
		async create(data) {
			const now = new Date().toISOString()
			const payload = { ...data, createdAt: now }
			const ref = await db.collection('webhookDeliveryLogs').add(payload)
			return normalizeDoc({ ...payload, id: ref.id }) as unknown as WebhookDeliveryLog & { id: string }
		},
	}
}
