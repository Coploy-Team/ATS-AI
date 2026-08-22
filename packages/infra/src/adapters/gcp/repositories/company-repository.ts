import type { Firestore } from 'firebase-admin/firestore'

import type { CompanyRepository } from '../../../interfaces/repositories'
import type { Company, InsightsCache } from '@coploy/domain'
import { applyFilters, mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'
import { CompanyRepositorySchema, InsightsCacheRepositorySchema } from '../../shared/repository-schemas'

export function createFirestoreCompanyRepository(db: Firestore): CompanyRepository {
	return {
		async getCompany(id) {
			const doc = await db.collection('companies').doc(id).get()
			return mapDoc<Company>(doc, CompanyRepositorySchema)
		},
		async listCompanies(options) {
			const queryRef = applyFilters(db.collection('companies'), options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<Company>(snapshot, CompanyRepositorySchema)
		},
		async createCompany(data, customId) {
			const id = customId ?? (await db.collection('companies').add(data)).id
			if (customId) await db.collection('companies').doc(customId).set(data)
			const normalized = normalizeDoc({ ...data, id })
			return { ...normalized, id } as Company & { id: string }
		},
		async updateCompany(id, data) {
			const updateData: Record<string, unknown> = { ...data }
			if (typeof updateData.jobPortal === 'string') {
				updateData.jobPortal = db.collection('jobPortal').doc(updateData.jobPortal)
			}
			if (typeof updateData.ownerCompany === 'string') {
				updateData.ownerCompany = db.collection('usersCompany').doc(updateData.ownerCompany)
			}
			await db.collection('companies').doc(id).update(updateData)
		},
		async getInsightsCache(companyId, cacheId) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('insightsCache')
				.doc(cacheId)
				.get()
			return mapDoc<InsightsCache>(doc, InsightsCacheRepositorySchema)
		},
		async setInsightsCache(companyId, cacheId, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('insightsCache')
				.doc(cacheId)
				.set(data, { merge: true })
		},
		async listInsightsCache(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('insightsCache')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<InsightsCache>(snapshot, InsightsCacheRepositorySchema)
		},
		async createInsightsCache(companyId, data) {
			const ref = await db.collection('companies').doc(companyId).collection('insightsCache').add(data)
			const normalized = normalizeDoc({ ...data, id: ref.id })
			return { ...normalized, id: ref.id } as InsightsCache & { id: string }
		},
	}
}
