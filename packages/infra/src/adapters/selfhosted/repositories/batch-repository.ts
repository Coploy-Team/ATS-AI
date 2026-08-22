import type { Batch } from '@coploy/domain'
import type { BatchRepository } from '../../../interfaces/repositories/batch-repository'
import type { DrizzleDb } from '../db/client'
import { BatchRepositorySchema } from '../../shared/repository-schemas'
import {
	applyPatch,
	buildListParams, castWithSchema, cleanForDb, eq, postProcess,
	randomUUID, schema, toJsonSafe,
	cast,
} from './helpers'

export function createDrizzleBatchRepository(db: DrizzleDb): BatchRepository {
	return {
		async getBatch(id) {
			const rows = await db.select().from(schema.batches).where(eq(schema.batches.id, id)).limit(1)
			if (!rows.length) return null
			return castWithSchema<Batch>(postProcess(schema.batches, rows[0] as Record<string, unknown>), BatchRepositorySchema)
		},

		async listBatches(options) {
			const { where, orderBy, limit } = buildListParams(schema.batches, {}, [], options)
			let query = db.select().from(schema.batches).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) => castWithSchema<Batch>(postProcess(schema.batches, r as Record<string, unknown>), BatchRepositorySchema))
		},

		async createBatch(data, customId) {
			const id = customId ?? randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.batches, payload)
			await db.insert(schema.batches).values({ id, ...cleaned } as typeof schema.batches.$inferInsert).onConflictDoNothing()
			return { ...payload, id }
		},

		async updateBatch(id, data) {
			const rows = await db.select().from(schema.batches).where(eq(schema.batches.id, id)).limit(1)
			if (!rows.length) return
			const current = postProcess(schema.batches, rows[0] as Record<string, unknown>)
			const patched = applyPatch(current, data)
			const cleaned = cleanForDb(schema.batches, patched)
			await db.update(schema.batches).set(cleaned as typeof schema.batches.$inferInsert).where(eq(schema.batches.id, id))
		},
	}
}
