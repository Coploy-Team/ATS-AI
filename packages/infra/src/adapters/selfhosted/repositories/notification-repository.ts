import type { CompanyNotification, NotificationMessage } from '@coploy/domain'
import type { NotificationRepository } from '../../../interfaces/repositories/notification-repository'
import type { DrizzleDb } from '../db/client'
import {
	CompanyNotificationRepositorySchema,
	NotificationMessageRepositorySchema,
} from '../../shared/repository-schemas'
import {
	and, applyPatch,
	buildListParams, castWithSchema, cleanForDb, eq, postProcess,
	randomUUID, schema, toJsonSafe,
	cast,
} from './helpers'

export function createDrizzleNotificationRepository(db: DrizzleDb): NotificationRepository {
	return {
		async listCompanyNotifications(companyId, options) {
			const staticConds = [eq(schema.companyNotifications.company_id, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.companyNotifications, {}, staticConds, options)
			let query = db.select().from(schema.companyNotifications).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) =>
				castWithSchema<CompanyNotification>(
					postProcess(schema.companyNotifications, r as Record<string, unknown>),
					CompanyNotificationRepositorySchema,
				),
			)
		},

		async getCompanyNotification(companyId, id) {
			const rows = await db.select().from(schema.companyNotifications)
				.where(and(eq(schema.companyNotifications.id, id), eq(schema.companyNotifications.company_id, companyId)))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<CompanyNotification>(postProcess(schema.companyNotifications, rows[0] as Record<string, unknown>), CompanyNotificationRepositorySchema)
		},

		async createCompanyNotification(companyId, data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.companyNotifications, { ...payload, company_id: companyId })
			await db.insert(schema.companyNotifications).values({ id, ...cleaned } as typeof schema.companyNotifications.$inferInsert)
			return { ...payload, id }
		},

		async updateCompanyNotification(companyId, id, data) {
			const rows = await db.select().from(schema.companyNotifications)
				.where(and(eq(schema.companyNotifications.id, id), eq(schema.companyNotifications.company_id, companyId)))
				.limit(1)
			if (!rows.length) return
			const current = postProcess(schema.companyNotifications, rows[0] as Record<string, unknown>)
			const patched = applyPatch(current, data)
			const cleaned = cleanForDb(schema.companyNotifications, patched)
			await db.update(schema.companyNotifications).set(cleaned as typeof schema.companyNotifications.$inferInsert).where(eq(schema.companyNotifications.id, id))
		},

		async deleteCompanyNotification(_companyId, id) {
			await db.delete(schema.companyNotifications).where(eq(schema.companyNotifications.id, id))
		},

		async listNotificationMessages(companyId, options) {
			const staticConds = [eq(schema.notificationMessages.company_id, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.notificationMessages, {}, staticConds, options)
			let query = db.select().from(schema.notificationMessages).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) =>
				castWithSchema<NotificationMessage>(
					postProcess(schema.notificationMessages, r as Record<string, unknown>),
					NotificationMessageRepositorySchema,
				),
			)
		},

		async getNotificationMessage(companyId, id) {
			const rows = await db.select().from(schema.notificationMessages)
				.where(and(eq(schema.notificationMessages.id, id), eq(schema.notificationMessages.company_id, companyId)))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<NotificationMessage>(postProcess(schema.notificationMessages, rows[0] as Record<string, unknown>), NotificationMessageRepositorySchema)
		},

		async createNotificationMessage(companyId, data, customId) {
			const id = customId ?? randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.notificationMessages, { ...payload, company_id: companyId })
			await db.insert(schema.notificationMessages).values({ id, ...cleaned } as typeof schema.notificationMessages.$inferInsert).onConflictDoNothing()
			return { ...payload, id }
		},

		async updateNotificationMessage(companyId, id, data) {
			const rows = await db.select().from(schema.notificationMessages)
				.where(and(eq(schema.notificationMessages.id, id), eq(schema.notificationMessages.company_id, companyId)))
				.limit(1)
			if (!rows.length) return
			const current = postProcess(schema.notificationMessages, rows[0] as Record<string, unknown>)
			const patched = applyPatch(current, data)
			const cleaned = cleanForDb(schema.notificationMessages, patched)
			await db.update(schema.notificationMessages).set(cleaned as typeof schema.notificationMessages.$inferInsert).where(eq(schema.notificationMessages.id, id))
		},

		async deleteNotificationMessage(_companyId, id) {
			await db.delete(schema.notificationMessages).where(eq(schema.notificationMessages.id, id))
		},
	}
}
