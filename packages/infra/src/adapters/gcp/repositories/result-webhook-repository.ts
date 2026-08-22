import type { Firestore } from 'firebase-admin/firestore'
import type { ResultWebhookRepository } from '../../../interfaces/repositories/result-webhook-repository'
import type { ResultWebhook } from '@coploy/domain'
import { ResultWebhookRepositorySchema } from '../../shared/repository-schemas'
import { mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

export function createFirestoreResultWebhookRepository(
	db: Firestore,
): ResultWebhookRepository {
	return {
		async listByCompany(companyId) {
			const snapshot = await db
				.collection('resultWebhooks')
				.where('companyId', '==', companyId)
				.get()
			return mapDocsWithSchema<ResultWebhook>(snapshot, ResultWebhookRepositorySchema)
		},
		async getById(id) {
			const doc = await db.collection('resultWebhooks').doc(id).get()
			return mapDoc<ResultWebhook>(doc, ResultWebhookRepositorySchema)
		},
		async create(data, customId) {
			const now = new Date().toISOString()
			const payload = { ...data, createdAt: now, updatedAt: now }
			if (customId) {
				await db.collection('resultWebhooks').doc(customId).set(payload)
				return normalizeDoc({ ...payload, id: customId }) as unknown as ResultWebhook & {
					id: string
				}
			}
			const ref = await db.collection('resultWebhooks').add(payload)
			return normalizeDoc({ ...payload, id: ref.id }) as unknown as ResultWebhook & {
				id: string
			}
		},
		async update(id, data) {
			await db
				.collection('resultWebhooks')
				.doc(id)
				.update({ ...data, updatedAt: new Date().toISOString() })
		},
		async delete(id) {
			await db.collection('resultWebhooks').doc(id).delete()
		},
	}
}
