import type { Firestore } from 'firebase-admin/firestore'

import type { Offer } from '@coploy/domain'

import type { OfferRepository } from '../../../interfaces/repositories'
import { mapDoc, mapDocs } from './helpers'

export function createFirestoreOfferRepository(db: Firestore): OfferRepository {
	const col = (companyId: string) => db.collection('companies').doc(companyId).collection('offers')

	return {
		async listOffers(companyId, jobId, candidateId) {
			const snapshot = await col(companyId)
				.where('jobId', '==', jobId)
				.where('candidateId', '==', candidateId)
				.get()
			return mapDocs<Offer>(snapshot)
				.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		},

		async getOffer(companyId, id) {
			const doc = await col(companyId).doc(id).get()
			return doc.exists ? mapDoc<Offer>(doc) : null
		},

		async createOffer(companyId, data) {
			const ref = await col(companyId).add({ ...data, createdAt: new Date() })
			const doc = await ref.get()
			return mapDoc<Offer & { id: string }>(doc)!
		},

		async updateOffer(companyId, id, data) {
			await col(companyId)
				.doc(id)
				.update({ ...data, updatedAt: new Date() })
		},
	}
}
