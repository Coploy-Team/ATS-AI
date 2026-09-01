import type { ResultWebhook } from '@coploy/domain'
import type { ResultWebhookRepository } from '../../../interfaces/repositories/result-webhook-repository'
import type { DrizzleDb } from '../db/client'
import { ResultWebhookRepositorySchema } from '../../shared/repository-schemas'
import { applyPatch, cast, castWithSchema, cleanForDb, eq, postProcess, randomUUID, schema, toJsonSafe } from './helpers'

export function createDrizzleResultWebhookRepository(
	db: DrizzleDb,
): ResultWebhookRepository {
	return {
		async listByCompany(companyId) {
			const rows = await db
				.select()
				.from(schema.resultWebhooks)
				.where(eq(schema.resultWebhooks.companyId, companyId))
			return rows.map((r) =>
				castWithSchema<ResultWebhook>(
					postProcess(schema.resultWebhooks, r as Record<string, unknown>),
					ResultWebhookRepositorySchema,
				),
			)
		},
		async getById(id) {
			const rows = await db
				.select()
				.from(schema.resultWebhooks)
				.where(eq(schema.resultWebhooks.id, id))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<ResultWebhook>(
				postProcess(schema.resultWebhooks, rows[0] as Record<string, unknown>),
				ResultWebhookRepositorySchema,
			)
		},
		async create(data, customId) {
			const id = customId ?? randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.resultWebhooks, payload)
			await db
				.insert(schema.resultWebhooks)
				.values({
					id,
					...cleaned,
				} as typeof schema.resultWebhooks.$inferInsert)
				.onConflictDoNothing()
			return { ...payload, id } as unknown as ResultWebhook & { id: string }
		},
		async update(id, data) {
			const rows = await db
				.select()
				.from(schema.resultWebhooks)
				.where(eq(schema.resultWebhooks.id, id))
				.limit(1)
			if (!rows.length) return
			const current = postProcess(schema.resultWebhooks, rows[0] as Record<string, unknown>)
			const patched = applyPatch(current, data)
			const cleaned = cleanForDb(schema.resultWebhooks, patched)
			await db
				.update(schema.resultWebhooks)
				.set(cleaned as typeof schema.resultWebhooks.$inferInsert)
				.where(eq(schema.resultWebhooks.id, id))
		},
		async delete(id) {
			await db
				.delete(schema.resultWebhooks)
				.where(eq(schema.resultWebhooks.id, id))
		},
	}
}
