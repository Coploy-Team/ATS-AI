import type { Firestore } from 'firebase-admin/firestore'

import type { HiringManagerReviewToken } from '@coploy/domain'
import type { HiringManagerReviewTokenRepository } from '../../../interfaces/repositories'

const COLLECTION = 'hmReviewTokens'

function toDate(value: unknown): Date | null {
	if (!value) return null
	if (value instanceof Date) return value
	if (typeof value === 'object' && value !== null && 'toDate' in value) {
		const maybe = (value as { toDate?: () => Date }).toDate
		if (typeof maybe === 'function') return maybe.call(value)
	}
	return null
}

export function createFirestoreHiringManagerReviewTokenRepository(
	db: Firestore,
): HiringManagerReviewTokenRepository {
	return {
		async createReviewToken(code, input) {
			await db.collection(COLLECTION).doc(code).set({
				companyId: input.companyId,
				jobId: input.jobId,
				jobAppliedIds: input.jobAppliedIds,
				createdByUserId: input.createdByUserId ?? null,
				createdAt: new Date(),
				expiresAt: input.expiresAt,
				usedAt: null,
				accessCode: null,
				accessExpiresAt: null,
			})
		},

		async consumeReviewToken(code, accessCode, accessExpiresAt) {
			const ref = db.collection(COLLECTION).doc(code)
			return db.runTransaction(async (tx) => {
				const snapshot = await tx.get(ref)
				if (!snapshot.exists) return null

				const data = snapshot.data() as Record<string, unknown>
				if (data.usedAt) return null

				const expiresAt = toDate(data.expiresAt)
				if (!expiresAt || expiresAt.getTime() < Date.now()) return null

				const usedAt = new Date()
				tx.update(ref, { usedAt, accessCode, accessExpiresAt })

				return {
					id: code,
					companyId: String(data.companyId ?? ''),
					jobId: String(data.jobId ?? ''),
					jobAppliedIds: Array.isArray(data.jobAppliedIds)
						? data.jobAppliedIds.map(String)
						: [],
					createdByUserId: (data.createdByUserId as string | null | undefined) ?? null,
					createdAt: toDate(data.createdAt),
					expiresAt,
					usedAt,
					accessCode,
					accessExpiresAt,
				} satisfies HiringManagerReviewToken
			})
		},

		async getByAccessCode(accessCode) {
			const snapshot = await db
				.collection(COLLECTION)
				.where('accessCode', '==', accessCode)
				.limit(1)
				.get()

			const doc = snapshot.docs[0]
			if (!doc) return null

			const data = doc.data() as Record<string, unknown>
			const accessExpiresAt = toDate(data.accessExpiresAt)
			if (!accessExpiresAt || accessExpiresAt.getTime() < Date.now()) return null

			return {
				id: doc.id,
				companyId: String(data.companyId ?? ''),
				jobId: String(data.jobId ?? ''),
				jobAppliedIds: Array.isArray(data.jobAppliedIds)
					? data.jobAppliedIds.map(String)
					: [],
				createdByUserId: (data.createdByUserId as string | null | undefined) ?? null,
				createdAt: toDate(data.createdAt),
				expiresAt: toDate(data.expiresAt),
				usedAt: toDate(data.usedAt),
				accessCode: (data.accessCode as string | null | undefined) ?? null,
				accessExpiresAt,
			} satisfies HiringManagerReviewToken
		},
	}
}
