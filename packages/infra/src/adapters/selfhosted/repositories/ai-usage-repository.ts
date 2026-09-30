import type { AiUsageEvent } from '@coploy/domain'
import type {
	AiUsageListOptions,
	AiUsageRepository,
} from '../../../interfaces/repositories/ai-usage-repository'
import type { DrizzleDb } from '../db/client'
import { AiUsageEventRepositorySchema } from '../../shared/repository-schemas'
import { and, cast, castWithSchema, cleanForDb, desc, eq, postProcess, randomUUID, schema, toJsonSafe } from './helpers'

export function createDrizzleAiUsageRepository(db: DrizzleDb): AiUsageRepository {
	return {
		async create(data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.aiUsageEvents, payload)
			await db
				.insert(schema.aiUsageEvents)
				.values({
					id,
					...cleaned,
				} as typeof schema.aiUsageEvents.$inferInsert)
				.onConflictDoNothing()
			return { ...payload, id } as AiUsageEvent & { id: string }
		},

		async list(options?: AiUsageListOptions) {
			const limit = options?.limit ?? 1000
			const filters = []
			if (options?.companyId) filters.push(eq(schema.aiUsageEvents.companyId, options.companyId))
			if (options?.month) filters.push(eq(schema.aiUsageEvents.occurredMonth, options.month))
			let q = db.select().from(schema.aiUsageEvents).$dynamic()
			if (filters.length) q = q.where(and(...filters))
			const rows = await q.orderBy(desc(schema.aiUsageEvents.occurredAt)).limit(limit)
			return rows.map((row) =>
				castWithSchema<AiUsageEvent>(
					postProcess(schema.aiUsageEvents, row as Record<string, unknown>),
					AiUsageEventRepositorySchema,
				),
			)
		},
	}
}
