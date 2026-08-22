import type { Firestore, Query } from 'firebase-admin/firestore'
import type { AiUsageEvent } from '@coploy/domain'
import type {
	AiUsageListOptions,
	AiUsageRepository,
} from '../../../interfaces/repositories/ai-usage-repository'
import { AiUsageEventRepositorySchema } from '../../shared/repository-schemas'
import { mapDocsWithSchema, normalizeDoc } from './helpers'

const COLLECTION = 'aiUsageEvents'

export function createFirestoreAiUsageRepository(db: Firestore): AiUsageRepository {
	return {
		async create(data) {
			const now = new Date().toISOString()
			const payload = { ...data, createdAt: now }
			const ref = await db.collection(COLLECTION).add(payload)
			return normalizeDoc({ ...payload, id: ref.id }) as unknown as AiUsageEvent & { id: string }
		},

		async list(options?: AiUsageListOptions) {
			const limit = options?.limit ?? 1000
			try {
				let q: Query = db.collection(COLLECTION)
				if (options?.companyId) q = q.where('companyId', '==', options.companyId)
				if (options?.month) q = q.where('occurredMonth', '==', options.month)
				q = q.orderBy('occurredAt', 'desc').limit(limit)
				const snapshot = await q.get()
				return mapDocsWithSchema<AiUsageEvent>(snapshot, AiUsageEventRepositorySchema)
			} catch (err: unknown) {
				const code = (err as { code?: number })?.code
				if (code === 9) {
					console.warn('[AiUsage] Firestore index not ready, using in-memory fallback')
					let fallback: Query = db.collection(COLLECTION)
					if (options?.month) {
						fallback = fallback.where('occurredMonth', '==', options.month)
					} else if (options?.companyId) {
						fallback = fallback.where('companyId', '==', options.companyId)
					}

					const snapshot = await fallback.limit(Math.max(limit, 5000)).get()
					return mapDocsWithSchema<AiUsageEvent>(snapshot, AiUsageEventRepositorySchema)
						.filter((event) => {
							if (options?.companyId && event.companyId !== options.companyId) return false
							if (options?.month && event.occurredMonth !== options.month) return false
							return true
						})
						.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
						.slice(0, limit)
				}
				throw err
			}
		},
	}
}
