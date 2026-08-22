import type { Firestore } from 'firebase-admin/firestore'

import type { RejectionReviewRequest } from '@coploy/domain'
import type { RejectionReviewRequestRepository } from '../../../interfaces/repositories'
import { RejectionReviewRequestRepositorySchema } from '../../shared/repository-schemas'
import { normalizeDoc } from './helpers'

const COLLECTION = 'rejectionReviewRequests'

function mapReview(data: Record<string, unknown>): RejectionReviewRequest & { id: string } {
	const parsed = RejectionReviewRequestRepositorySchema.parse(normalizeDoc(data))
	return parsed as RejectionReviewRequest & { id: string }
}

export function createFirestoreRejectionReviewRequestRepository(
	db: Firestore,
): RejectionReviewRequestRepository {
	const collection = db.collection(COLLECTION)

	return {
		async create(data) {
			const ref = await collection.add(data)
			return mapReview({ ...data, id: ref.id })
		},
		async findByJobAppliedId(jobAppliedId) {
			const snapshot = await collection
				.where('jobAppliedId', '==', jobAppliedId)
				.limit(1)
				.get()
			const doc = snapshot.docs[0]
			return doc ? mapReview({ ...doc.data(), id: doc.id }) : null
		},
		async listPendingByCompany(companyId, options) {
			const snapshot = await collection
				.where('companyId', '==', companyId)
				.where('status', '==', 'pending')
				.limit(options?.limit ?? 1000)
				.get()

			return snapshot.docs
				.map((doc) => mapReview({ ...doc.data(), id: doc.id }))
				.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
		},
		async getById(id) {
			const doc = await collection.doc(id).get()
			return doc.exists ? mapReview({ ...doc.data(), id: doc.id }) : null
		},
		async update(id, data) {
			await collection.doc(id).update(data)
		},
	}
}
