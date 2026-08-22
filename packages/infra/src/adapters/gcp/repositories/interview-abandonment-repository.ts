import type { Firestore } from 'firebase-admin/firestore'

import type { InterviewAbandonment } from '@coploy/domain'
import type { InterviewAbandonmentRepository } from '../../../interfaces/repositories'
import { InterviewAbandonmentRepositorySchema } from '../../shared/repository-schemas'
import { normalizeDoc } from './helpers'

export function createFirestoreInterviewAbandonmentRepository(
	db: Firestore,
): InterviewAbandonmentRepository {
	return {
		async create(data) {
			const ref = await db.collection('interviewAbandonments').add(data)
			const parsed = InterviewAbandonmentRepositorySchema.parse(
				normalizeDoc({ ...data, id: ref.id }),
			)
			return parsed as InterviewAbandonment & { id: string }
		},
		async list(options) {
			const snapshot = await db
				.collection('interviewAbandonments')
				.orderBy('createdAt', 'desc')
				.limit(options.limit ?? 1000)
				.get()

			return snapshot.docs.map((doc) => {
				const parsed = InterviewAbandonmentRepositorySchema.parse(
					normalizeDoc({ ...doc.data(), id: doc.id }),
				)
				return parsed as InterviewAbandonment & { id: string }
			})
		},
	}
}
