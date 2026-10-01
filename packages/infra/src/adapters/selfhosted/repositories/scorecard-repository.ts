import { and, eq } from 'drizzle-orm'

import type { Scorecard, ScorecardCriterion } from '@coploy/domain'

import type { ScorecardRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { scorecards } from '../db/schema/tables'

/** Linha do Postgres → tipo de domínio (jsonb chega como `unknown`). */
function toDomain(row: typeof scorecards.$inferSelect): Scorecard {
	return {
		id: row.id,
		companyId: row.company_id,
		jobId: row.jobId,
		candidateId: row.candidateId,
		authorId: row.authorId,
		authorName: row.authorName,
		criteria: (row.criteria as ScorecardCriterion[]) ?? [],
		recommendation: row.recommendation as Scorecard['recommendation'],
		comment: row.comment,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

export function createSelfHostedScorecardRepository(db: DrizzleDb): ScorecardRepository {
	return {
		async listScorecards(companyId, jobId, candidateId) {
			const rows = await db
				.select()
				.from(scorecards)
				.where(
					and(
						eq(scorecards.company_id, companyId),
						eq(scorecards.jobId, jobId),
						eq(scorecards.candidateId, candidateId),
					),
				)
			return rows.map(toDomain)
		},

		async getScorecardByAuthor(companyId, jobId, candidateId, authorId) {
			const [row] = await db
				.select()
				.from(scorecards)
				.where(
					and(
						eq(scorecards.company_id, companyId),
						eq(scorecards.jobId, jobId),
						eq(scorecards.candidateId, candidateId),
						eq(scorecards.authorId, authorId),
					),
				)
				.limit(1)
			return row ? toDomain(row) : null
		},

		async createScorecard(companyId, data) {
			const id = crypto.randomUUID()
			await db.insert(scorecards).values({
				id,
				company_id: companyId,
				jobId: data.jobId as string,
				candidateId: data.candidateId as string,
				authorId: data.authorId as string,
				authorName: (data.authorName as string) ?? null,
				criteria: (data.criteria as ScorecardCriterion[]) ?? [],
				recommendation: data.recommendation as string,
				comment: (data.comment as string) ?? null,
			})
			const [row] = await db.select().from(scorecards).where(eq(scorecards.id, id)).limit(1)
			return toDomain(row) as Scorecard & { id: string }
		},

		async updateScorecard(companyId, id, data) {
			await db
				.update(scorecards)
				.set({
					...(data.criteria ? { criteria: data.criteria as ScorecardCriterion[] } : {}),
					...(data.recommendation ? { recommendation: data.recommendation as string } : {}),
					...(data.comment !== undefined ? { comment: (data.comment as string) ?? null } : {}),
					updatedAt: new Date(),
				})
				.where(and(eq(scorecards.company_id, companyId), eq(scorecards.id, id)))
		},

		async deleteScorecard(companyId, id) {
			await db
				.delete(scorecards)
				.where(and(eq(scorecards.company_id, companyId), eq(scorecards.id, id)))
		},
	}
}
