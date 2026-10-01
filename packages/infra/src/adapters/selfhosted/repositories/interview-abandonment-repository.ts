import type { InterviewAbandonment } from '@coploy/domain'
import type { InterviewAbandonmentRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { InterviewAbandonmentRepositorySchema } from '../../shared/repository-schemas'
import {
	cast,
	castWithSchema,
	cleanForDb,
	desc,
	postProcess,
	randomUUID,
	schema,
	toJsonSafe,
} from './helpers'

export function createDrizzleInterviewAbandonmentRepository(
	db: DrizzleDb,
): InterviewAbandonmentRepository {
	return {
		async create(data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.interviewAbandonments, payload)
			const rows = await db
				.insert(schema.interviewAbandonments)
				.values({ id, ...cleaned } as typeof schema.interviewAbandonments.$inferInsert)
				.returning()
			return castWithSchema<InterviewAbandonment>(
				postProcess(schema.interviewAbandonments, rows[0] as Record<string, unknown>),
				InterviewAbandonmentRepositorySchema,
			)
		},
		async list(options) {
			const rows = await db
				.select()
				.from(schema.interviewAbandonments)
				.orderBy(desc(schema.interviewAbandonments.createdAt))
				.limit(options.limit ?? 1000)

			return rows.map((row) =>
				castWithSchema<InterviewAbandonment>(
					postProcess(schema.interviewAbandonments, row as Record<string, unknown>),
					InterviewAbandonmentRepositorySchema,
				),
			)
		},
	}
}
