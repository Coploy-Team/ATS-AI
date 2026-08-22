import type { Firestore } from 'firebase-admin/firestore'

import type { CollaboratorRepository } from '../../../interfaces/repositories'
import type { Collaborator } from '@coploy/domain'
import { CollaboratorRepositorySchema } from '../../shared/repository-schemas'
import { applyFilters, mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

export function createFirestoreCollaboratorRepository(db: Firestore): CollaboratorRepository {
	return {
		async listCollaborators(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('collaborators')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<Collaborator>(snapshot, CollaboratorRepositorySchema)
		},
		async listAllCollaborators(opts) {
			const limit = opts?.limit ?? 500
			// Hydrate company_id from parent doc path; collaborator docs sometimes don't
			// have it set (path is companies/{companyId}/collaborators/{id}).
			const enrich = (snap: FirebaseFirestore.QuerySnapshot): Collaborator[] => {
				const list: Collaborator[] = []
				for (const doc of snap.docs) {
					const raw: Record<string, unknown> = { id: doc.id, ...(doc.data() as Record<string, unknown>) }
					if (!raw.company_id) {
						const parent = doc.ref.parent.parent
						if (parent) raw.company_id = parent.id
					}
					list.push(
						(CollaboratorRepositorySchema.parse(normalizeDoc(raw)) as unknown) as Collaborator,
					)
				}
				return list
			}

			try {
				if (opts?.companyId) {
					const col = db
						.collection('companies')
						.doc(opts.companyId)
						.collection('collaborators')
					const snap = await col.limit(limit).get()
					return enrich(snap)
				}
				const snap = await db.collectionGroup('collaborators').limit(limit).get()
				return enrich(snap)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					console.warn('[Collaborator] listAll index not ready, returning empty list')
					return []
				}
				throw err
			}
		},
		async getCollaborator(companyId, id) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('collaborators')
				.doc(id)
				.get()
			return mapDoc<Collaborator>(doc, CollaboratorRepositorySchema)
		},
		async createCollaborator(companyId, data) {
			const ref = await db
				.collection('companies')
				.doc(companyId)
				.collection('collaborators')
				.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as Collaborator & { id: string }
		},
		async updateCollaborator(companyId, id, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('collaborators')
				.doc(id)
				.update(data)
		},
		async deleteCollaborator(companyId, id) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('collaborators')
				.doc(id)
				.delete()
		},
	}
}
