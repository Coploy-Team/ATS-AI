import type { Firestore } from 'firebase-admin/firestore'

import type { InterviewHandoff } from '@coploy/domain'
import type { InterviewHandoffRepository } from '../../../interfaces/repositories'

const COLLECTION = 'interviewHandoffs'

export function createFirestoreInterviewHandoffRepository(db: Firestore): InterviewHandoffRepository {
	return {
		async createHandoff(code, userId, expiresAt) {
			await db.collection(COLLECTION).doc(code).set({
				userId,
				createdAt: new Date(),
				expiresAt,
				usedAt: null,
			})
		},

		async consumeHandoff(code) {
			const ref = db.collection(COLLECTION).doc(code)
			// Transação: a leitura e a marcação de uso acontecem juntas, então
			// duas trocas simultâneas do mesmo código não podem ambas vencer.
			return db.runTransaction(async (tx) => {
				const snapshot = await tx.get(ref)
				if (!snapshot.exists) return null

				const data = snapshot.data() as {
					userId?: string
					createdAt?: { toDate?: () => Date }
					expiresAt?: { toDate?: () => Date }
					usedAt?: unknown
				}
				if (data.usedAt) return null

				const expiresAt = data.expiresAt?.toDate?.() ?? null
				if (!expiresAt || expiresAt.getTime() < Date.now()) return null

				const usedAt = new Date()
				tx.update(ref, { usedAt })

				return {
					id: code,
					userId: data.userId ?? null,
					createdAt: data.createdAt?.toDate?.() ?? null,
					expiresAt,
					usedAt,
				} satisfies InterviewHandoff
			})
		},
	}
}
