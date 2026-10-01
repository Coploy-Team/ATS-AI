import { and, asc, eq } from 'drizzle-orm'

import type { CandidateTimelineEntry, TimelineEventType } from '@coploy/domain'

import type { CandidateTimelineRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { candidateTimeline } from '../db/schema/tables'

function toDomain(row: typeof candidateTimeline.$inferSelect): CandidateTimelineEntry {
	return {
		id: row.id,
		companyId: row.company_id,
		jobId: row.jobId,
		candidateId: row.candidateId,
		type: row.type as TimelineEventType,
		authorId: row.authorId,
		authorName: row.authorName,
		body: row.body,
		metadata: (row.metadata as Record<string, unknown>) ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

export function createSelfHostedCandidateTimelineRepository(
	db: DrizzleDb,
): CandidateTimelineRepository {
	return {
		async listTimeline(companyId, jobId, candidateId) {
			const rows = await db
				.select()
				.from(candidateTimeline)
				.where(
					and(
						eq(candidateTimeline.company_id, companyId),
						eq(candidateTimeline.jobId, jobId),
						eq(candidateTimeline.candidateId, candidateId),
					),
				)
				.orderBy(asc(candidateTimeline.createdAt))
			return rows.map(toDomain)
		},

		async appendEntry(companyId, data) {
			const id = crypto.randomUUID()
			await db.insert(candidateTimeline).values({
				id,
				company_id: companyId,
				jobId: data.jobId as string,
				candidateId: data.candidateId as string,
				type: data.type as string,
				authorId: (data.authorId as string) ?? null,
				authorName: (data.authorName as string) ?? null,
				body: (data.body as string) ?? null,
				metadata: (data.metadata as Record<string, unknown>) ?? null,
			})
			const [row] = await db
				.select()
				.from(candidateTimeline)
				.where(eq(candidateTimeline.id, id))
				.limit(1)
			return toDomain(row) as CandidateTimelineEntry & { id: string }
		},

		async updateEntry(companyId, id, body) {
			await db
				.update(candidateTimeline)
				.set({ body, updatedAt: new Date() })
				.where(and(eq(candidateTimeline.company_id, companyId), eq(candidateTimeline.id, id)))
		},

		async deleteEntry(companyId, id) {
			await db
				.delete(candidateTimeline)
				.where(and(eq(candidateTimeline.company_id, companyId), eq(candidateTimeline.id, id)))
		},
	}
}
