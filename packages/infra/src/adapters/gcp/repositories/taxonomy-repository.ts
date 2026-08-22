import type { Firestore } from 'firebase-admin/firestore'

import type { Occupation, Skill } from '@coploy/domain'

import type { TaxonomyRepository } from '../../../interfaces/repositories'
import { mapDoc, mapDocs } from './helpers'

/**
 * Taxonomia em coleções de topo (V2-801).
 *
 * Não é dado de tenant: CBO e ESCO são públicas e iguais para todo mundo.
 * Guardar por empresa multiplicaria milhares de documentos por cliente sem
 * nenhum ganho.
 */
export function createFirestoreTaxonomyRepository(db: Firestore): TaxonomyRepository {
	const occupations = db.collection('occupations')
	const skills = db.collection('skills')

	/** Firestore aceita 500 escritas por batch. */
	const BATCH_LIMIT = 450

	async function upsertAll<T extends { id: string }>(
		collection: FirebaseFirestore.CollectionReference,
		items: T[],
	): Promise<number> {
		let written = 0
		for (let index = 0; index < items.length; index += BATCH_LIMIT) {
			const batch = db.batch()
			for (const item of items.slice(index, index + BATCH_LIMIT)) {
				// merge: recarregar não apaga campo curado à mão
				batch.set(collection.doc(item.id), item as never, { merge: true })
				written += 1
			}
			await batch.commit()
		}
		return written
	}

	return {
		async listOccupations(taxonomyVersion) {
			const query = taxonomyVersion
				? occupations.where('taxonomyVersion', '==', taxonomyVersion)
				: occupations
			const snapshot = await query.get()
			return mapDocs<Occupation>(snapshot)
		},
		async listSkills(taxonomyVersion) {
			const query = taxonomyVersion
				? skills.where('taxonomyVersion', '==', taxonomyVersion)
				: skills
			const snapshot = await query.get()
			return mapDocs<Skill>(snapshot)
		},
		async upsertOccupations(items) {
			return upsertAll(occupations, items)
		},
		async upsertSkills(items) {
			return upsertAll(skills, items)
		},
		async recordPendingSkill(name, taxonomyVersion) {
			const id = `skill:${name}`
			const ref = skills.doc(id)
			await db.runTransaction(async (tx) => {
				const doc = await tx.get(ref)
				if (doc.exists) {
					// contagem prioriza a fila de curadoria
					tx.update(ref, { occurrences: (doc.data()?.occurrences ?? 0) + 1 })
					return
				}
				tx.set(ref, {
					id,
					name,
					synonyms: [],
					source: 'curated',
					taxonomyVersion,
					pendingCuration: true,
					occurrences: 1,
				})
			})
		},
	}
}
