import type { Firestore } from 'firebase-admin/firestore'

import type { BillingRepository } from '../../../interfaces/repositories'
import type { BillingHistory, CreditsUsed, Nps, StripeWebhookHistory, SubscriptionHistory } from '@coploy/domain'
import {
	BillingHistoryRepositorySchema,
	CreditsUsedRepositorySchema,
	NpsRepositorySchema,
	SubscriptionHistoryRepositorySchema,
} from '../../shared/repository-schemas'
import { applyFilters, mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

export function createFirestoreBillingRepository(db: Firestore): BillingRepository {
	return {
		async listCreditsUsed(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('creditsUsed')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<CreditsUsed>(snapshot, CreditsUsedRepositorySchema)
		},
		async getCreditsUsed(companyId, id) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('creditsUsed')
				.doc(id)
				.get()
			return mapDoc<CreditsUsed>(doc, CreditsUsedRepositorySchema)
		},
		async createCreditsUsed(companyId, data) {
			const ref = await db
				.collection('companies')
				.doc(companyId)
				.collection('creditsUsed')
				.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as CreditsUsed & { id: string }
		},
		async listSubscriptionHistory(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('subscriptionHistory')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<SubscriptionHistory>(snapshot, SubscriptionHistoryRepositorySchema)
		},
		async createSubscriptionHistory(companyId, data) {
			const ref = await db
				.collection('companies')
				.doc(companyId)
				.collection('subscriptionHistory')
				.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as SubscriptionHistory & { id: string }
		},
		async listAllSubscriptionHistory(opts) {
			// Cross-company collectionGroup query. Mantemos sem orderBy pra evitar
			// índice composto; quem chama ordena/filtra em memória.
			let query: FirebaseFirestore.Query = db.collectionGroup('subscriptionHistory')
			if (opts?.action) {
				query = query.where('action', '==', opts.action)
			}
			if (opts?.sinceUnix !== undefined) {
				query = query.where('timestamp', '>=', opts.sinceUnix)
			}
			if (opts?.limit) query = query.limit(opts.limit)
			const snapshot = await query.get()
			const items = mapDocsWithSchema<SubscriptionHistory>(
				snapshot,
				SubscriptionHistoryRepositorySchema,
			)
			// Hidrata companyId via parent ref (subcoleção mora em /companies/{id}/subscriptionHistory)
			const docsArr = snapshot.docs
			items.forEach((item, idx) => {
				const parent = docsArr[idx]?.ref.parent.parent
				if (parent && !(item as { companyId?: string }).companyId) {
					;(item as { companyId?: string }).companyId = parent.id
				}
			})
			return items
		},
		async listNps(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('nps')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<Nps>(snapshot, NpsRepositorySchema)
		},
		async createNps(companyId, data) {
			const ref = await db.collection('companies').doc(companyId).collection('nps').add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as Nps & { id: string }
		},
		async createStripeWebhookHistory(data) {
			const ref = await db.collection('stripeWebhookHistory').add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as StripeWebhookHistory & { id: string }
		},
		async createBillingHistory(companyId, data) {
			const ref = await db.collection('billing_history').add({ ...data, companyId })
			return normalizeDoc({ ...data, companyId, id: ref.id }) as unknown as BillingHistory & { id: string }
		},
		async listBillingHistory(companyId, options) {
			const col = db.collection('billing_history')
			const baseQuery = col.where('companyId', '==', companyId)
			let query: FirebaseFirestore.Query = baseQuery
			if (options?.orderByField) {
				query = query.orderBy(options.orderByField, options.orderDirection ?? 'asc')
			}
			if (options?.limitTo) {
				query = query.limit(options.limitTo)
			}
			const snapshot = await query.get()
			return mapDocsWithSchema<BillingHistory>(snapshot, BillingHistoryRepositorySchema)
		},
	}
}
