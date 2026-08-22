import type { Batch } from '@coploy/domain'
import type { Firestore } from 'firebase-admin/firestore'
import type { BatchRepository } from '../../../interfaces/repositories'
import { BatchRepositorySchema } from '../../shared/repository-schemas'
import { applyFilters, mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

export function createFirestoreBatchRepository(db: Firestore): BatchRepository {
	return {
		async getBatch(id) {
			const doc = await db.collection('batches').doc(id).get()
			return mapDoc<Batch>(doc, BatchRepositorySchema)
		},
		async listBatches(options) {
			const queryRef = applyFilters(db.collection('batches'), options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<Batch>(snapshot, BatchRepositorySchema)
		},
		async createBatch(data, customId) {
			const col = db.collection('batches')
			if (customId) {
				await col.doc(customId).set(data)
				return normalizeDoc({ ...data, id: customId }) as unknown as Batch & { id: string }
			}
			const ref = await col.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as Batch & { id: string }
		},
		async updateBatch(id, data) {
			await db.collection('batches').doc(id).update(data)
		},
	}
}
