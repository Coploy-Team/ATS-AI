import type { CreditsUsed, SubscriptionHistory, Nps, BillingHistory, StripeWebhookHistory } from '@coploy/domain'
import type { BillingRepository } from '../../../interfaces/repositories/billing-repository'
import type { DrizzleDb } from '../db/client'
import {
	BillingHistoryRepositorySchema,
	CreditsUsedRepositorySchema,
	NpsRepositorySchema,
	StripeWebhookHistoryRepositorySchema,
	SubscriptionHistoryRepositorySchema,
} from '../../shared/repository-schemas'
import {
	and,
	buildListParams, cleanForDb, eq, postProcess,
	randomUUID, schema, toJsonSafe,
	cast, castWithSchema,
} from './helpers'

export function createDrizzleBillingRepository(db: DrizzleDb): BillingRepository {
	return {
		async listCreditsUsed(companyId, options) {
			const staticConds = [eq(schema.creditsUsed.company_id, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.creditsUsed, {}, staticConds, options)
			let query = db.select().from(schema.creditsUsed).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) => castWithSchema<CreditsUsed>(postProcess(schema.creditsUsed, r as Record<string, unknown>), CreditsUsedRepositorySchema))
		},

		async getCreditsUsed(companyId, id) {
			const rows = await db.select().from(schema.creditsUsed)
				.where(and(eq(schema.creditsUsed.id, id), eq(schema.creditsUsed.company_id, companyId)))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<CreditsUsed>(postProcess(schema.creditsUsed, rows[0] as Record<string, unknown>), CreditsUsedRepositorySchema)
		},

		async createCreditsUsed(companyId, data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.creditsUsed, { ...payload, company_id: companyId })
			await db.insert(schema.creditsUsed).values({ id, ...cleaned } as typeof schema.creditsUsed.$inferInsert)
			return { ...payload, id }
		},

		async listSubscriptionHistory(companyId, options) {
			const staticConds = [eq(schema.subscriptionHistory.company_id, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.subscriptionHistory, {}, staticConds, options)
			let query = db.select().from(schema.subscriptionHistory).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) => castWithSchema<SubscriptionHistory>(postProcess(schema.subscriptionHistory, r as Record<string, unknown>), SubscriptionHistoryRepositorySchema))
		},

		async createSubscriptionHistory(companyId, data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.subscriptionHistory, { ...payload, company_id: companyId })
			await db.insert(schema.subscriptionHistory).values({ id, ...cleaned } as typeof schema.subscriptionHistory.$inferInsert)
			return castWithSchema<SubscriptionHistory>({ ...payload, id }, SubscriptionHistoryRepositorySchema)
		},

		async listAllSubscriptionHistory() {
			throw new Error(
				'[selfhosted] listAllSubscriptionHistory not implemented — admin console é GCP-only por enquanto',
			)
		},

		async listNps(companyId, options) {
			const staticConds = [eq(schema.nps.company_id, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.nps, {}, staticConds, options)
			let query = db.select().from(schema.nps).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) => castWithSchema<Nps>(postProcess(schema.nps, r as Record<string, unknown>), NpsRepositorySchema))
		},

		async createNps(companyId, data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.nps, { ...payload, company_id: companyId })
			await db.insert(schema.nps).values({ id, ...cleaned } as typeof schema.nps.$inferInsert)
			return castWithSchema<Nps>({ ...payload, id }, NpsRepositorySchema)
		},

		async createStripeWebhookHistory(data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.stripeWebhookHistory, payload)
			await db.insert(schema.stripeWebhookHistory).values({ id, ...cleaned } as typeof schema.stripeWebhookHistory.$inferInsert)
			return castWithSchema<StripeWebhookHistory>({ ...payload, id }, StripeWebhookHistoryRepositorySchema)
		},

		async createBillingHistory(companyId, data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.billingHistory, { ...payload, companyId })
			await db.insert(schema.billingHistory).values({ id, companyId, ...cleaned } as typeof schema.billingHistory.$inferInsert)
			return castWithSchema<BillingHistory>({ ...payload, companyId, id }, BillingHistoryRepositorySchema)
		},

		async listBillingHistory(companyId, options) {
			const staticConds = [eq(schema.billingHistory.companyId, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.billingHistory, {}, staticConds, options)
			let query = db.select().from(schema.billingHistory).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) => castWithSchema<BillingHistory>(postProcess(schema.billingHistory, r as Record<string, unknown>), BillingHistoryRepositorySchema))
		},
	}
}
