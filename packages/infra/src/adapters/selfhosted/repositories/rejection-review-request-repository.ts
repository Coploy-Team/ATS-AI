import type { RejectionReviewRequest } from '@coploy/domain'
import type { RejectionReviewRequestRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { RejectionReviewRequestRepositorySchema } from '../../shared/repository-schemas'
import {
	and,
	cast,
	castWithSchema,
	cleanForDb,
	desc,
	eq,
	postProcess,
	randomUUID,
	schema,
	toJsonSafe,
} from './helpers'

function mapReview(row: Record<string, unknown>): RejectionReviewRequest & { id: string } {
	return castWithSchema<RejectionReviewRequest>(
		postProcess(schema.rejectionReviewRequests, row),
		RejectionReviewRequestRepositorySchema,
	)
}

export function createDrizzleRejectionReviewRequestRepository(
	db: DrizzleDb,
): RejectionReviewRequestRepository {
	const table = schema.rejectionReviewRequests

	return {
		async create(data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(table, payload)
			const rows = await db
				.insert(table)
				.values({ id, ...cleaned } as typeof table.$inferInsert)
				.returning()
			return mapReview(rows[0] as Record<string, unknown>)
		},
		async findByJobAppliedId(jobAppliedId) {
			const rows = await db
				.select()
				.from(table)
				.where(eq(table.jobAppliedId, jobAppliedId))
				.limit(1)
			return rows[0] ? mapReview(rows[0] as Record<string, unknown>) : null
		},
		async listPendingByCompany(companyId, options) {
			const rows = await db
				.select()
				.from(table)
				.where(and(eq(table.companyId, companyId), eq(table.status, 'pending')))
				.orderBy(desc(table.requestedAt))
				.limit(options?.limit ?? 1000)
			return rows.map((row) => mapReview(row as Record<string, unknown>))
		},
		async getById(id) {
			const rows = await db
				.select()
				.from(table)
				.where(eq(table.id, id))
				.limit(1)
			return rows[0] ? mapReview(rows[0] as Record<string, unknown>) : null
		},
		async update(id, data) {
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(table, payload)
			await db
				.update(table)
				.set({ ...cleaned, updatedAt: new Date() } as Partial<typeof table.$inferInsert>)
				.where(eq(table.id, id))
		},
	}
}
