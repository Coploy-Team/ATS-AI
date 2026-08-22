import type { Firestore } from 'firebase-admin/firestore'
import type { EnterprisePayment } from '@coploy/domain'
import type { EnterprisePaymentRepository } from '../../../interfaces/repositories/enterprise-payment-repository'
import { EnterprisePaymentRepositorySchema } from '../../shared/repository-schemas'
import { mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

const COLLECTION = 'enterprisePayments'

export function createFirestoreEnterprisePaymentRepository(
	db: Firestore,
): EnterprisePaymentRepository {
	return {
		async list(opts) {
			// Sem orderBy aqui pra evitar índice composto. Volume baixo (1 doc/empresa/mês).
			let query = db.collection(COLLECTION) as FirebaseFirestore.Query
			if (opts?.companyId) query = query.where('companyId', '==', opts.companyId)
			if (opts?.contractId) query = query.where('contractId', '==', opts.contractId)
			if (opts?.status) query = query.where('status', '==', opts.status)
			if (opts?.limit) query = query.limit(opts.limit)
			const snapshot = await query.get()
			let items = mapDocsWithSchema<EnterprisePayment>(
				snapshot,
				EnterprisePaymentRepositorySchema,
			)
			if (opts?.sinceUnix !== undefined) {
				const minMs = opts.sinceUnix * 1000
				items = items.filter((p) => {
					const createdAtMs =
						p.createdAt instanceof Date ? p.createdAt.getTime() : null
					return createdAtMs !== null && createdAtMs >= minMs
				})
			}
			items.sort((a, b) => {
				const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0
				const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0
				return tb - ta
			})
			return items
		},
		async getById(id) {
			const doc = await db.collection(COLLECTION).doc(id).get()
			return mapDoc<EnterprisePayment>(doc, EnterprisePaymentRepositorySchema)
		},
		async listByCompany(companyId) {
			const snapshot = await db
				.collection(COLLECTION)
				.where('companyId', '==', companyId)
				.get()
			const items = mapDocsWithSchema<EnterprisePayment>(
				snapshot,
				EnterprisePaymentRepositorySchema,
			)
			items.sort((a, b) => {
				if (a.period && b.period && a.period !== b.period)
					return b.period.localeCompare(a.period)
				const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0
				const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0
				return tb - ta
			})
			return items
		},
		async create(data, customId) {
			const ref = customId
				? db.collection(COLLECTION).doc(customId)
				: db.collection(COLLECTION).doc()
			const payload = {
				...data,
				createdAt: (data as { createdAt?: unknown }).createdAt ?? new Date(),
			}
			await ref.set(payload)
			return normalizeDoc({ ...payload, id: ref.id }) as unknown as EnterprisePayment & {
				id: string
			}
		},
		async update(id, data) {
			const payload = { ...data, updatedAt: new Date() }
			await db.collection(COLLECTION).doc(id).update(payload)
		},
		async delete(id) {
			await db.collection(COLLECTION).doc(id).delete()
		},
	}
}
