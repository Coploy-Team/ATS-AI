import type { Firestore } from 'firebase-admin/firestore'
import type { EnterpriseContract } from '@coploy/domain'
import type { EnterpriseContractRepository } from '../../../interfaces/repositories/enterprise-contract-repository'
import { EnterpriseContractRepositorySchema } from '../../shared/repository-schemas'
import { mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

const COLLECTION = 'enterpriseContracts'

export function createFirestoreEnterpriseContractRepository(
	db: Firestore,
): EnterpriseContractRepository {
	return {
		async list(opts) {
			// Sem orderBy aqui: filtros compostos exigiriam índices Firestore;
			// volume é pequeno (< 1000 docs), ordenamos em memória depois.
			let query = db.collection(COLLECTION) as FirebaseFirestore.Query
			if (opts?.companyId) {
				query = query.where('companyId', '==', opts.companyId)
			}
			if (opts?.status) {
				query = query.where('status', '==', opts.status)
			}
			if (opts?.limit) query = query.limit(opts.limit)
			const snapshot = await query.get()
			const items = mapDocsWithSchema<EnterpriseContract>(
				snapshot,
				EnterpriseContractRepositorySchema,
			)
			items.sort((a, b) => {
				const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0
				const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0
				return tb - ta
			})
			return items
		},
		async getById(id) {
			const doc = await db.collection(COLLECTION).doc(id).get()
			return mapDoc<EnterpriseContract>(doc, EnterpriseContractRepositorySchema)
		},
		async listByCompany(companyId) {
			const snapshot = await db
				.collection(COLLECTION)
				.where('companyId', '==', companyId)
				.get()
			const items = mapDocsWithSchema<EnterpriseContract>(
				snapshot,
				EnterpriseContractRepositorySchema,
			)
			items.sort((a, b) => {
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
			return normalizeDoc({ ...payload, id: ref.id }) as unknown as EnterpriseContract & {
				id: string
			}
		},
		async update(id, data) {
			const payload = {
				...data,
				updatedAt: new Date(),
			}
			await db.collection(COLLECTION).doc(id).update(payload)
		},
		async delete(id) {
			await db.collection(COLLECTION).doc(id).delete()
		},
	}
}
