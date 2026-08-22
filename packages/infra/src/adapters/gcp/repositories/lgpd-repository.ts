import type { Firestore } from 'firebase-admin/firestore'

import type { ConsentRecord, DataSubjectRequest } from '@coploy/domain'

import type { LgpdRepository } from '../../../interfaces/repositories'
import { mapDoc, mapDocs } from './helpers'

/**
 * Consentimento e trilha de auditoria (V2-701).
 *
 * Coleções de topo, não subcoleções do usuário: a trilha precisa sobreviver à
 * exclusão do titular. Apagar `users/{id}` e levar junto a prova de que a
 * exclusão foi feita destruiria exatamente o documento que a fiscalização pede.
 */
export function createFirestoreLgpdRepository(db: Firestore): LgpdRepository {
	const consents = db.collection('dataConsents')
	const requests = db.collection('dataSubjectRequests')

	return {
		async listConsents(userId) {
			const snapshot = await consents.where('userId', '==', userId).get()
			return mapDocs<ConsentRecord>(snapshot)
		},
		async createConsent(data) {
			const ref = await consents.add({ ...data, createdAt: new Date() })
			return mapDoc<ConsentRecord & { id: string }>(await ref.get())!
		},
		async revokeConsent(id, revokedAt) {
			await consents.doc(id).update({ granted: false, revokedAt })
		},

		async listRequests(userId) {
			const snapshot = await requests.where('userId', '==', userId).get()
			return mapDocs<DataSubjectRequest>(snapshot)
		},
		async createRequest(data) {
			const ref = await requests.add({ ...data })
			return mapDoc<DataSubjectRequest & { id: string }>(await ref.get())!
		},
		async completeRequest(id, data) {
			await requests.doc(id).update({
				status: data.status,
				completedAt: new Date(),
				...(data.affected ? { affected: data.affected } : {}),
				...(data.error ? { error: data.error } : {}),
			})
		},
	}
}
