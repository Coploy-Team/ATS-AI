import type { Firestore } from 'firebase-admin/firestore'

import type { Scorecard } from '@coploy/domain'

import type { ScorecardRepository } from '../../../interfaces/repositories'
import { mapDoc, mapDocs } from './helpers'

/**
 * Avaliações do recrutador (V2-302).
 *
 * Path: `companies/{companyId}/scorecards/{id}`, coleção plana com filtro por
 * vaga e candidato — em vez de aninhar sob a vaga. Aninhar tornaria "todas as
 * avaliações que este recrutador fez" uma varredura de subcoleções, e essa é a
 * consulta que a análise de calibragem vai precisar depois.
 */
export function createFirestoreScorecardRepository(db: Firestore): ScorecardRepository {
	const col = (companyId: string) =>
		db.collection('companies').doc(companyId).collection('scorecards')

	return {
		async listScorecards(companyId, jobId, candidateId) {
			const snapshot = await col(companyId)
				.where('jobId', '==', jobId)
				.where('candidateId', '==', candidateId)
				.get()
			return mapDocs<Scorecard>(snapshot)
		},

		async getScorecardByAuthor(companyId, jobId, candidateId, authorId) {
			const snapshot = await col(companyId)
				.where('jobId', '==', jobId)
				.where('candidateId', '==', candidateId)
				.where('authorId', '==', authorId)
				.limit(1)
				.get()
			return snapshot.empty ? null : mapDoc<Scorecard>(snapshot.docs[0])
		},

		async createScorecard(companyId, data) {
			const ref = await col(companyId).add({
				...data,
				createdAt: new Date(),
			})
			const doc = await ref.get()
			return mapDoc<Scorecard & { id: string }>(doc)!
		},

		async updateScorecard(companyId, id, data) {
			await col(companyId)
				.doc(id)
				.update({ ...data, updatedAt: new Date() })
		},

		async deleteScorecard(companyId, id) {
			await col(companyId).doc(id).delete()
		},
	}
}
