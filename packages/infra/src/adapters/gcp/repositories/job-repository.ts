import { FieldValue, type Firestore } from 'firebase-admin/firestore'

import type { JobRepository } from '../../../interfaces/repositories'
import type { InfoJob, InterviewWhatsapp, JobPortal, PostJob } from '@coploy/domain'
import { extractRefId } from '../../shared/ref-utils'
import { applyFilters, mapArrayToCollectionDocRefs, mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'
import { InfoJobRepositorySchema, PostJobRepositorySchema } from '../../shared/repository-schemas'

function mapJobRefs(db: Firestore, companyId: string, data: Record<string, unknown>) {
	const dataWithRefs: Record<string, unknown> = { ...data }

	if (typeof dataWithRefs.infoJobs === 'string') {
		dataWithRefs.infoJobs = db
			.collection('companies')
			.doc(companyId)
			.collection('infoJobs')
			.doc(dataWithRefs.infoJobs)
	}

	if (typeof dataWithRefs.uid_notification_message === 'string') {
		dataWithRefs.uid_notification_message = db
			.collection('companies')
			.doc(companyId)
			.collection('notificationMessage')
			.doc(dataWithRefs.uid_notification_message)
	}

	if (Array.isArray(dataWithRefs.usersApplied)) {
		dataWithRefs.usersApplied = mapArrayToCollectionDocRefs(db, 'users', dataWithRefs.usersApplied)
	}

	return dataWithRefs
}

export function createFirestoreJobRepository(db: Firestore): JobRepository {
	return {
		async getJob(companyId, jobId) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.get()
			return mapDoc<PostJob>(doc, PostJobRepositorySchema)
		},
		async listJobs(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('postJob')
			const queryRef = applyFilters(col, options)
			try {
				const snapshot = await queryRef.get()
				return mapDocsWithSchema<PostJob>(snapshot, PostJobRepositorySchema)
			} catch (error) {
				// Firestore composite ordering (ex: priority desc + timeCreated desc)
				// pode exigir índice composite ainda não provisionado. Retornar lista
				// vazia até que o índice esteja pronto — UI continua funcional.
				const code = (error as { code?: number }).code
				if (code === 9) {
					console.warn('[GCP/postJob] listJobs missing composite index — returning empty list')
					return []
				}
				throw error
			}
		},
		async listPublicJobs(options) {
			const limit = options?.limit ?? 200
			try {
				const snapshot = await db
					.collectionGroup('postJob')
					.where('public', '==', true)
					.orderBy('timeCreated', 'desc')
					.limit(limit)
					.get()
				return snapshot.docs.flatMap((doc) => {
					// postJob é subcoleção de companies/{companyId} — o pai do pai é o doc da empresa
					const companyId = doc.ref.parent.parent?.id
					if (!companyId) return []
					const job = mapDoc<PostJob>(doc, PostJobRepositorySchema)
					return job ? [{ ...job, companyId }] : []
				})
			} catch (error) {
				const code = (error as { code?: number }).code
				if (code === 9) {
					console.warn('[GCP/postJob] listPublicJobs missing collection-group index — returning empty list')
					return []
				}
				throw error
			}
		},
		async listPublicJobsByCompany(companyId, options) {
			const limit = options?.limit ?? 200
			try {
				const snapshot = await db
					.collection('companies')
					.doc(companyId)
					.collection('postJob')
					.where('public', '==', true)
					.orderBy('timeCreated', 'desc')
					.limit(limit)
					.get()
				return mapDocsWithSchema<PostJob>(snapshot, PostJobRepositorySchema)
			} catch (error) {
				const code = (error as { code?: number }).code
				if (code === 9) {
					console.warn('[GCP/postJob] listPublicJobsByCompany missing composite index — returning empty list')
					return []
				}
				throw error
			}
		},
		async createJob(companyId, data, customId) {
			const col = db.collection('companies').doc(companyId).collection('postJob')
			const dataWithRefs = mapJobRefs(db, companyId, data)
			if (customId) {
				await col.doc(customId).set(dataWithRefs)
				return normalizeDoc({ ...dataWithRefs, id: customId }) as unknown as PostJob & { id: string }
			}
			const ref = await col.add(dataWithRefs)
			return normalizeDoc({ ...dataWithRefs, id: ref.id }) as unknown as PostJob & { id: string }
		},
		async updateJob(companyId, jobId, data) {
			const dataWithRefs = mapJobRefs(db, companyId, data)
			await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.update(dataWithRefs)
		},
		async syncPostJobUsersApplied(companyId, jobId, userId) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.update({
					usersApplied: FieldValue.arrayUnion(db.collection('users').doc(userId)),
				})
		},
		async getInfoJobByPostJob(companyId, jobId) {
			const jobDoc = await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.get()
			if (!jobDoc.exists) return null

			const infoJobId = extractRefId(jobDoc.data()?.infoJobs)
			if (!infoJobId) return null

			const infoDoc = await db
				.collection('companies')
				.doc(companyId)
				.collection('infoJobs')
				.doc(infoJobId)
				.get()
			return mapDoc<InfoJob>(infoDoc, InfoJobRepositorySchema)
		},
		async deleteJob(companyId, jobId) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('postJob')
				.doc(jobId)
				.delete()
		},
		async listInfoJobs(companyId) {
			const snapshot = await db
				.collection('companies')
				.doc(companyId)
				.collection('infoJobs')
				.get()
			return mapDocsWithSchema<InfoJob>(snapshot, InfoJobRepositorySchema)
		},
		async getInfoJob(companyId, id) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('infoJobs')
				.doc(id)
				.get()
			return mapDoc<InfoJob>(doc, InfoJobRepositorySchema)
		},
		async createInfoJob(companyId, data, customId) {
			const col = db.collection('companies').doc(companyId).collection('infoJobs')
			if (customId) {
				await col.doc(customId).set(data)
				return normalizeDoc({ ...data, id: customId }) as unknown as InfoJob & { id: string }
			}
			const ref = await col.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as InfoJob & { id: string }
		},
		async updateInfoJob(companyId, id, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('infoJobs')
				.doc(id)
				.update(data)
		},
		async deleteInfoJob(companyId, id) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('infoJobs')
				.doc(id)
				.delete()
		},
		async getJobPortal(id) {
			const doc = await db.collection('jobPortal').doc(id).get()
			return mapDoc<JobPortal>(doc)
		},
		async getJobPortalByCompany(companyId) {
			const snapshot = await db
				.collection('jobPortal')
				.where('company_id', '==', companyId)
				.limit(1)
				.get()
			if (snapshot.empty) return null
			return mapDoc<JobPortal>(snapshot.docs[0])
		},
		async createJobPortal(data, customId) {
			const col = db.collection('jobPortal')
			if (customId) {
				await col.doc(customId).set(data)
				return normalizeDoc({ ...data, id: customId }) as unknown as JobPortal & { id: string }
			}
			const ref = await col.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as JobPortal & { id: string }
		},
		async updateJobPortal(id, data) {
			await db.collection('jobPortal').doc(id).update(data)
		},
		async createInterviewWhatsapp(data, customId) {
			if (customId) {
				await db.collection('interview_whatsapp').doc(customId).set(data)
				return normalizeDoc({ ...data, id: customId }) as unknown as InterviewWhatsapp & { id: string }
			}
			const ref = await db.collection('interview_whatsapp').add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as InterviewWhatsapp & { id: string }
		},
	}
}
