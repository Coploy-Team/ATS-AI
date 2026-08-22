import type { Firestore } from 'firebase-admin/firestore'
import type { AdminUser } from '@coploy/domain'
import type { AdminUserRepository } from '../../../interfaces/repositories/admin-user-repository'
import { AdminUserRepositorySchema } from '../../shared/repository-schemas'
import { mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

const COLLECTION = 'adminUsers'

function normalizeEmailId(email: string): string {
	return email.trim().toLowerCase()
}

export function createFirestoreAdminUserRepository(db: Firestore): AdminUserRepository {
	return {
		async getByEmail(email) {
			const id = normalizeEmailId(email)
			const doc = await db.collection(COLLECTION).doc(id).get()
			return mapDoc<AdminUser>(doc, AdminUserRepositorySchema)
		},
		async list() {
			const snapshot = await db.collection(COLLECTION).orderBy('email').get()
			return mapDocsWithSchema<AdminUser>(snapshot, AdminUserRepositorySchema)
		},
		async create(data, customId) {
			const email = normalizeEmailId((data as { email: string }).email)
			const id = customId ?? email
			await db.collection(COLLECTION).doc(id).set({ ...data, email })
			return normalizeDoc({ ...data, email, id }) as unknown as AdminUser & { id: string }
		},
		async update(id, data) {
			await db.collection(COLLECTION).doc(normalizeEmailId(id)).update(data)
		},
		async delete(id) {
			await db.collection(COLLECTION).doc(normalizeEmailId(id)).delete()
		},
	}
}
