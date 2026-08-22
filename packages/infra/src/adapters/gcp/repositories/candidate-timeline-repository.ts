import type { Firestore } from 'firebase-admin/firestore'

import type { CandidateTimelineEntry } from '@coploy/domain'

import type { CandidateTimelineRepository } from '../../../interfaces/repositories'
import { mapDoc, mapDocs } from './helpers'

/**
 * `companies/{companyId}/candidateTimeline/{id}` — coleção plana com filtro.
 *
 * Ordenação por `createdAt` no cliente: a lista de um candidato é pequena
 * (dezenas), e um índice composto por vaga+candidato+data seria mais uma peça de
 * Terraform para manter sem ganho real.
 */
export function createFirestoreCandidateTimelineRepository(
	db: Firestore,
): CandidateTimelineRepository {
	const col = (companyId: string) =>
		db.collection('companies').doc(companyId).collection('candidateTimeline')

	return {
		async listTimeline(companyId, jobId, candidateId) {
			const snapshot = await col(companyId)
				.where('jobId', '==', jobId)
				.where('candidateId', '==', candidateId)
				.get()
			return mapDocs<CandidateTimelineEntry>(snapshot).sort(
				(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			)
		},

		async appendEntry(companyId, data) {
			const ref = await col(companyId).add({ ...data, createdAt: new Date() })
			const doc = await ref.get()
			// o doc acabou de ser criado — `null` aqui é impossibilidade, não caso
			return mapDoc<CandidateTimelineEntry & { id: string }>(doc)!
		},

		async updateEntry(companyId, id, body) {
			await col(companyId).doc(id).update({ body, updatedAt: new Date() })
		},

		async deleteEntry(companyId, id) {
			await col(companyId).doc(id).delete()
		},
	}
}
