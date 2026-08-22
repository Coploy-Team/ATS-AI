import type { CandidateProfile, User, UsersCompany } from '@coploy/domain'
import type { Firestore } from 'firebase-admin/firestore'
import type { UserRepository } from '../../../interfaces/repositories'
import { UserRepositorySchema, UsersCompanyRepositorySchema } from '../../shared/repository-schemas'
import { mapDoc, normalizeDoc } from './helpers'

export function createFirestoreUserRepository(db: Firestore): UserRepository {
	return {
		async getUser(id) {
			const doc = await db.collection('users').doc(id).get()
			return mapDoc<User>(doc, UserRepositorySchema)
		},
		async updateUser(id, data) {
			await db.collection('users').doc(id).update(data)
		},
		async createUser(data, customId) {
			if (customId) {
				await db.collection('users').doc(customId).set(data)
				return normalizeDoc({ ...data, id: customId }) as unknown as User & { id: string }
			}
			const ref = await db.collection('users').add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as User & { id: string }
		},
		async getUsersCompany(id) {
			const doc = await db.collection('usersCompany').doc(id).get()
			return mapDoc<UsersCompany>(doc, UsersCompanyRepositorySchema)
		},
		async createUsersCompany(data, customId) {
			const dataWithRefs: Record<string, unknown> = { ...data }
			if (typeof dataWithRefs.company === 'string') {
				dataWithRefs.company = db.collection('companies').doc(dataWithRefs.company)
			}
			await db.collection('usersCompany').doc(customId).set(dataWithRefs)
			return normalizeDoc({ ...dataWithRefs, id: customId }) as unknown as UsersCompany & { id: string }
		},
		async updateUsersCompany(id, data) {
			await db.collection('usersCompany').doc(id).update(data)
		},
		async deleteUsersCompany(id) {
			await db.collection('usersCompany').doc(id).delete()
		},
		async getCandidateProfile(id) {
			const doc = await db.collection('candidateProfiles').doc(id).get()
			return mapDoc<CandidateProfile>(doc)
		},
		async createCandidateProfile(data, customId) {
			await db.collection('candidateProfiles').doc(customId).set(data)
			return normalizeDoc({ ...data, id: customId }) as unknown as CandidateProfile & { id: string }
		},
		async updateCandidateProfile(id, data) {
			await db.collection('candidateProfiles').doc(id).update(data)
		},
		async findUserByPhone(phone) {
			const snapshot = await db.collection('users')
				.where('phone_number', '==', phone)
				.limit(1)
				.get()
			if (snapshot.empty) return null
			return mapDoc<User>(snapshot.docs[0]!, UserRepositorySchema)
		},
		async findUserByEmail(email) {
			const snapshot = await db.collection('users')
				.where('email', '==', email)
				.limit(1)
				.get()
			if (snapshot.empty) return null
			return mapDoc<User>(snapshot.docs[0]!, UserRepositorySchema)
		},
		async deleteUser(id) {
			await db.collection('users').doc(id).delete()
		},
	}
}
