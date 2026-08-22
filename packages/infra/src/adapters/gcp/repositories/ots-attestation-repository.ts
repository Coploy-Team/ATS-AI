import type { Firestore } from 'firebase-admin/firestore'

import type { OtsAttestation } from '@coploy/domain'
import type { OtsAttestationRepository } from '../../../interfaces/repositories/ots-attestation-repository'

const COLLECTION = 'otsAttestations'

function toDate(value: unknown): Date | null {
	if (!value) return null
	if (value instanceof Date) return value
	const timestamp = value as { toDate?: () => Date }
	return typeof timestamp.toDate === 'function' ? timestamp.toDate() : null
}

function mapDoc(id: string, data: FirebaseFirestore.DocumentData): OtsAttestation {
	return {
		id,
		userId: (data.userId as string) ?? '',
		jobAppliedId: (data.jobAppliedId as string) ?? '',
		companyId: (data.companyId as string) ?? null,
		jobId: (data.jobId as string) ?? null,
		tier: data.tier as OtsAttestation['tier'],
		kid: (data.kid as string) ?? '',
		jws: (data.jws as string) ?? '',
		issuedAt: toDate(data.issuedAt) ?? new Date(0),
		expiresAt: toDate(data.expiresAt),
		revokedAt: toDate(data.revokedAt),
	}
}

export function createFirestoreOtsAttestationRepository(db: Firestore): OtsAttestationRepository {
	return {
		async createAttestation(record) {
			const { id, ...rest } = record
			await db.collection(COLLECTION).doc(id).set(rest)
		},

		async getAttestation(jti) {
			const snapshot = await db.collection(COLLECTION).doc(jti).get()
			if (!snapshot.exists) return null
			return mapDoc(snapshot.id, snapshot.data() ?? {})
		},

		async listAttestationsByUser(userId) {
			const snapshot = await db
				.collection(COLLECTION)
				.where('userId', '==', userId)
				.get()
			return snapshot.docs
				.map((doc) => mapDoc(doc.id, doc.data()))
				.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
		},

		async revokeAttestation(jti, userId) {
			const ref = db.collection(COLLECTION).doc(jti)
			// Transação: a checagem de dono e a marcação acontecem juntas.
			return db.runTransaction(async (tx) => {
				const snapshot = await tx.get(ref)
				if (!snapshot.exists) return false
				const data = snapshot.data() ?? {}
				if (data.userId !== userId) return false
				if (!data.revokedAt) tx.update(ref, { revokedAt: new Date() })
				return true
			})
		},
	}
}
