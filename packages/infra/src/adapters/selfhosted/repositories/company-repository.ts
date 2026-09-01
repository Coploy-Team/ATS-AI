import type { Company, InsightsCache } from '@coploy/domain'
import type { CompanyRepository } from '../../../interfaces/repositories/company-repository'
import { CompanyRepositorySchema, InsightsCacheRepositorySchema } from '../../shared/repository-schemas'
import type { DrizzleDb } from '../db/client'
import {
	and, applyPatch, buildListParams, cleanForDb, eq,
	castWithSchema, randomUUID, schema,
	toJsonSafe,
} from './helpers'

/** Drizzle inferred row type for companies table */
type CompanyRow = typeof schema.companies.$inferSelect

/** Maps a flat DB row to the domain Company shape (flat → nested) */
function mapCompanyFromRow(row: CompanyRow): Company {
	return {
		id: row.id,
		companyName: row.companyName,
		companyBio: row.companyBio,
		companLogo: row.companLogo,
		companyCity: row.companyCity,
		companyCountry: row.companyCountry,
		companyState: row.companyState,
		companySize: row.companySize,
		companyWebsite: row.companyWebsite,
		companyId: row.companyId,
		segment: row.segment,
		subscriptionPlan: row.subscriptionPlan,
		subscriptionStatus: row.subscriptionStatus,
		subscriptionId: row.subscriptionId,
		stripeCustomerId: row.stripeCustomerId,
		currentPeriodEnd: row.currentPeriodEnd,
		trialEnd: row.trialEnd,
		objective: row.objective,
		typeInterview: row.typeInterview,
		headquartersCountries: row.headquartersCountries,
		notificationsEmail: row.notificationsEmail,
		notificationReportWeek: row.notificationReportWeek,
		evaluateInternationalCandidates: row.evaluateInternationalCandidates,
		whatsappBetaAccess: row.whatsappBetaAccess,
		retro2025: row.retro2025,
		featureFlags: (row.featureFlags as Company['featureFlags']) ?? null,
		/*
		 * A leitura aqui é campo a campo: coluna que não é mapeada some sem
		 * erro nenhum. Foi assim que `orgUnitId` da vaga gravou e nunca voltou.
		 */
		stageActions: (row.stageActions as Company['stageActions']) ?? null,
		// flat → nested
		ownerCompany: row.ownerUserCompanyId ? { id: row.ownerUserCompanyId } : null,
		subscriptionCredits: {
			creditsMonthly: row.creditsMonthly ?? 0,
			creditsCourtesy: row.creditsCourtesy ?? 0,
			creditsFixed: row.creditsFixed ?? 0,
		},
		subscriptionDetails: {
			startAt: row.subscriptionStartAt ?? null,
			endAt: row.subscriptionEndAt ?? null,
		},
		subscriptionTrial: {
			courtesyCreditsGranted: row.trialCourtesyCreditsGranted ?? 0,
			grantedAt: row.trialGrantedAt ?? null,
		},
		features: {
			useEngineProcessing: row.featureUseEngineProcessing ?? false,
		},
	}
}

/** Maps a domain Company (partial) back to flat DB columns (nested → flat) */
function mapCompanyToRow(doc: Record<string, unknown>): Record<string, unknown> {
	const row: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(doc)) {
		if (k === 'id' || k === 'jobPortal') continue
		if (k === 'ownerCompany') {
			const ref = v as { id?: string } | string | null
			if (typeof ref === 'object' && ref) row.ownerUserCompanyId = ref.id
			else if (typeof ref === 'string') row.ownerUserCompanyId = ref
			continue
		}
		if (k === 'subscriptionCredits') {
			const o = v as Record<string, unknown> | null
			if (o) {
				row.creditsMonthly = o.creditsMonthly ?? 0
				row.creditsCourtesy = o.creditsCourtesy ?? 0
				row.creditsFixed = o.creditsFixed ?? 0
			}
			continue
		}
		if (k === 'subscriptionDetails') {
			const o = v as Record<string, unknown> | null
			if (o) {
				row.subscriptionStartAt = o.startAt
				row.subscriptionEndAt = o.endAt
			}
			continue
		}
		if (k === 'subscriptionTrial') {
			const o = v as Record<string, unknown> | null
			if (o) {
				row.trialCourtesyCreditsGranted = o.courtesyCreditsGranted ?? 0
				row.trialGrantedAt = o.grantedAt
			}
			continue
		}
		if (k === 'features') {
			row.featureUseEngineProcessing = (v as Record<string, unknown>)?.useEngineProcessing ?? false
			continue
		}
		row[k] = v
	}
	return row
}

/** Field map for query filters (dot-notation → DB column) */
const FIELD_MAP = {
	'ownerCompany.id': schema.companies.ownerUserCompanyId,
	'subscriptionDetails.stripeCustomerId': schema.companies.stripeCustomerId,
	'subscriptionCredits.creditsMonthly': schema.companies.creditsMonthly,
	'subscriptionCredits.creditsCourtesy': schema.companies.creditsCourtesy,
	'subscriptionCredits.creditsFixed': schema.companies.creditsFixed,
	'subscriptionDetails.startAt': schema.companies.subscriptionStartAt,
	'subscriptionDetails.endAt': schema.companies.subscriptionEndAt,
	'features.useEngineProcessing': schema.companies.featureUseEngineProcessing,
}

/** Drizzle inferred row type for insightsCache table */
type InsightsCacheRow = typeof schema.insightsCache.$inferSelect

/** Maps a flat DB row to the domain InsightsCache shape */
function mapInsightsCacheFromRow(row: InsightsCacheRow): InsightsCache {
	return {
		id: row.id,
		company_id: row.company_id,
		language: row.language,
		insight: row.insight,
		generatedAt: row.generatedAt,
	}
}

export function createDrizzleCompanyRepository(db: DrizzleDb): CompanyRepository {
	return {
		async getCompany(id) {
			const rows = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1)
			if (!rows.length) return null
			return castWithSchema<Company>(mapCompanyFromRow(rows[0]), CompanyRepositorySchema)
		},

		async listCompanies(options) {
			const { where, orderBy, limit } = buildListParams(schema.companies, FIELD_MAP, [], options)
			let query = db.select().from(schema.companies).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((row) => castWithSchema<Company>(mapCompanyFromRow(row), CompanyRepositorySchema))
		},

		async createCompany(data, customId) {
			const id = customId ?? randomUUID()
			const payload = toJsonSafe(data) as Record<string, unknown>
			const decomposed = mapCompanyToRow(payload)
			const cleaned = cleanForDb(schema.companies, decomposed)
			await db.insert(schema.companies).values({ id, ...cleaned } as typeof schema.companies.$inferInsert).onConflictDoNothing()
			return { ...payload, id } as Company & { id: string }
		},

		async updateCompany(id, data) {
			const rows = await db.select().from(schema.companies).where(eq(schema.companies.id, id)).limit(1)
			if (!rows.length) return
			const current = mapCompanyFromRow(rows[0]) as unknown as Record<string, unknown>
			const patched = applyPatch(current, data)
			const decomposed = mapCompanyToRow(patched)
			const cleaned = cleanForDb(schema.companies, decomposed)
			await db.update(schema.companies).set(cleaned as typeof schema.companies.$inferInsert).where(eq(schema.companies.id, id))
		},

		async getInsightsCache(companyId, cacheId) {
			const rows = await db.select().from(schema.insightsCache)
				.where(and(eq(schema.insightsCache.company_id, companyId), eq(schema.insightsCache.id, cacheId)))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<InsightsCache>(mapInsightsCacheFromRow(rows[0]), InsightsCacheRepositorySchema)
		},

		async setInsightsCache(companyId, cacheId, data) {
			const payload = toJsonSafe(data) as Record<string, unknown>
			const cleaned = cleanForDb(schema.insightsCache, { ...payload, company_id: companyId })
			await db.insert(schema.insightsCache)
				.values({ id: cacheId, company_id: companyId, ...cleaned } as typeof schema.insightsCache.$inferInsert)
				.onConflictDoUpdate({ target: schema.insightsCache.id, set: cleaned as typeof schema.insightsCache.$inferInsert })
		},

		async listInsightsCache(companyId, options) {
			const staticConds = [eq(schema.insightsCache.company_id, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.insightsCache, {}, staticConds, options)
			let query = db.select().from(schema.insightsCache).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((row) => castWithSchema<InsightsCache>(mapInsightsCacheFromRow(row), InsightsCacheRepositorySchema))
		},

		async createInsightsCache(companyId, data) {
			const id = randomUUID()
			const payload = toJsonSafe(data) as Record<string, unknown>
			const cleaned = cleanForDb(schema.insightsCache, { ...payload, company_id: companyId })
			await db.insert(schema.insightsCache).values({ id, company_id: companyId, ...cleaned } as typeof schema.insightsCache.$inferInsert)
			return { ...payload, id } as InsightsCache & { id: string }
		},
	}
}
