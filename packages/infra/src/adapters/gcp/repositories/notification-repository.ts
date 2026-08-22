import type { Firestore } from 'firebase-admin/firestore'

import type { NotificationRepository } from '../../../interfaces/repositories'
import type { CompanyNotification, NotificationMessage } from '@coploy/domain'
import {
	CompanyNotificationRepositorySchema,
	NotificationMessageRepositorySchema,
} from '../../shared/repository-schemas'
import { applyFilters, mapDoc, mapDocsWithSchema, normalizeDoc } from './helpers'

export function createFirestoreNotificationRepository(db: Firestore): NotificationRepository {
	return {
		async listCompanyNotifications(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('companyNotification')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<CompanyNotification>(snapshot, CompanyNotificationRepositorySchema)
		},
		async getCompanyNotification(companyId, id) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('companyNotification')
				.doc(id)
				.get()
			return mapDoc<CompanyNotification>(doc, CompanyNotificationRepositorySchema)
		},
		async createCompanyNotification(companyId, data) {
			const ref = await db
				.collection('companies')
				.doc(companyId)
				.collection('companyNotification')
				.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as CompanyNotification & { id: string }
		},
		async updateCompanyNotification(companyId, id, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('companyNotification')
				.doc(id)
				.update(data)
		},
		async deleteCompanyNotification(companyId, id) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('companyNotification')
				.doc(id)
				.delete()
		},
		async listNotificationMessages(companyId, options) {
			const col = db.collection('companies').doc(companyId).collection('notificationMessage')
			const queryRef = applyFilters(col, options)
			const snapshot = await queryRef.get()
			return mapDocsWithSchema<NotificationMessage>(snapshot, NotificationMessageRepositorySchema)
		},
		async getNotificationMessage(companyId, id) {
			const doc = await db
				.collection('companies')
				.doc(companyId)
				.collection('notificationMessage')
				.doc(id)
				.get()
			return mapDoc<NotificationMessage>(doc, NotificationMessageRepositorySchema)
		},
		async createNotificationMessage(companyId, data, customId) {
			const col = db.collection('companies').doc(companyId).collection('notificationMessage')
			if (customId) {
				await col.doc(customId).set(data)
				return normalizeDoc({ ...data, id: customId }) as unknown as NotificationMessage & { id: string }
			}
			const ref = await col.add(data)
			return normalizeDoc({ ...data, id: ref.id }) as unknown as NotificationMessage & { id: string }
		},
		async updateNotificationMessage(companyId, id, data) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('notificationMessage')
				.doc(id)
				.update(data)
		},
		async deleteNotificationMessage(companyId, id) {
			await db
				.collection('companies')
				.doc(companyId)
				.collection('notificationMessage')
				.doc(id)
				.delete()
		},
	}
}
