import type { Firestore } from 'firebase-admin/firestore'
import type { MotorLicense } from '@coploy/domain'
import type { MotorLicenseRepository } from '../../../interfaces/repositories/motor-license-repository'
import { normalizeDoc } from './helpers'

const COLLECTION = 'motorLicenses'

/** Doc id = SHA-256 hex da chave — a chave em claro nunca é gravada. */
export function createFirestoreMotorLicenseRepository(db: Firestore): MotorLicenseRepository {
	return {
		async getByKeyHash(keyHash) {
			const doc = await db.collection(COLLECTION).doc(keyHash).get()
			if (!doc.exists) return null
			const data = normalizeDoc(doc.data() ?? {}) as Omit<MotorLicense, 'id'>
			return { ...data, id: doc.id }
		},
		async touch(keyHash, patch) {
			await db
				.collection(COLLECTION)
				.doc(keyHash)
				.set(
					{
						lastSeenAt: patch.lastSeenAt,
						...(patch.instance !== undefined ? { instance: patch.instance } : {}),
					},
					{ merge: true },
				)
		},
	}
}
