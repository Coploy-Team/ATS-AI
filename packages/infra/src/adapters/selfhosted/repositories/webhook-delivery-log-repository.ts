import type { WebhookDeliveryLog } from '@coploy/domain'
import type { WebhookDeliveryLogRepository } from '../../../interfaces/repositories/webhook-delivery-log-repository'
import type { DrizzleDb } from '../db/client'
import { WebhookDeliveryLogRepositorySchema } from '../../shared/repository-schemas'
import { cast, castWithSchema, cleanForDb, desc, eq, postProcess, randomUUID, schema, toJsonSafe } from './helpers'

export function createDrizzleWebhookDeliveryLogRepository(
	db: DrizzleDb,
): WebhookDeliveryLogRepository {
	return {
		async listByCompany(companyId, limit = 20) {
			const rows = await db
				.select()
				.from(schema.webhookDeliveryLogs)
				.where(eq(schema.webhookDeliveryLogs.companyId, companyId))
				.orderBy(desc(schema.webhookDeliveryLogs.createdAt))
				.limit(limit)
			return rows.map((r) =>
				castWithSchema<WebhookDeliveryLog>(
					postProcess(schema.webhookDeliveryLogs, r as Record<string, unknown>),
					WebhookDeliveryLogRepositorySchema,
				),
			)
		},
		async listByWebhook(webhookId, limit = 20) {
			const rows = await db
				.select()
				.from(schema.webhookDeliveryLogs)
				.where(eq(schema.webhookDeliveryLogs.webhookId, webhookId))
				.orderBy(desc(schema.webhookDeliveryLogs.createdAt))
				.limit(limit)
			return rows.map((r) =>
				castWithSchema<WebhookDeliveryLog>(
					postProcess(schema.webhookDeliveryLogs, r as Record<string, unknown>),
					WebhookDeliveryLogRepositorySchema,
				),
			)
		},
		async listAll(opts) {
			const limit = opts?.limit ?? 100
			let q = db.select().from(schema.webhookDeliveryLogs).$dynamic()
			if (typeof opts?.success === 'boolean') {
				q = q.where(eq(schema.webhookDeliveryLogs.success, opts.success))
			}
			const rows = await q.orderBy(desc(schema.webhookDeliveryLogs.createdAt)).limit(limit)
			return rows.map((r) =>
				castWithSchema<WebhookDeliveryLog>(
					postProcess(schema.webhookDeliveryLogs, r as Record<string, unknown>),
					WebhookDeliveryLogRepositorySchema,
				),
			)
		},
		async getById(id) {
			const rows = await db
				.select()
				.from(schema.webhookDeliveryLogs)
				.where(eq(schema.webhookDeliveryLogs.id, id))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<WebhookDeliveryLog>(
				postProcess(schema.webhookDeliveryLogs, rows[0] as Record<string, unknown>),
				WebhookDeliveryLogRepositorySchema,
			)
		},
		async create(data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.webhookDeliveryLogs, payload)
			await db
				.insert(schema.webhookDeliveryLogs)
				.values({
					id,
					...cleaned,
				} as typeof schema.webhookDeliveryLogs.$inferInsert)
				.onConflictDoNothing()
			return { ...payload, id } as unknown as WebhookDeliveryLog & { id: string }
		},
	}
}
