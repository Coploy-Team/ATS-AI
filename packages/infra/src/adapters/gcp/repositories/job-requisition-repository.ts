import type { Firestore } from 'firebase-admin/firestore'

import type { JobRequisition } from '@coploy/domain'

import type { JobRequisitionRepository } from '../../../interfaces/repositories'
import { mapDoc, mapDocs } from './helpers'

export function createFirestoreJobRequisitionRepository(db: Firestore): JobRequisitionRepository {
	const col = (companyId: string) =>
		db.collection('companies').doc(companyId).collection('jobRequisitions')

	return {
		async listRequisitions(companyId, status) {
			const base = col(companyId)
			const snapshot = await (status ? base.where('status', '==', status) : base).get()
			// mais recentes primeiro: a fila de aprovação é lida de cima
			return mapDocs<JobRequisition>(snapshot).sort(
				(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			)
		},

		async getRequisition(companyId, id) {
			const doc = await col(companyId).doc(id).get()
			return doc.exists ? mapDoc<JobRequisition>(doc) : null
		},

		async createRequisition(companyId, data) {
			const ref = await col(companyId).add({ ...data, createdAt: new Date() })
			const doc = await ref.get()
			// o doc acabou de ser criado — `null` aqui é impossibilidade, não caso
			return mapDoc<JobRequisition & { id: string }>(doc)!
		},

		async updateRequisition(companyId, id, data) {
			await col(companyId)
				.doc(id)
				.update({ ...data, updatedAt: new Date() })
		},
	}
}
