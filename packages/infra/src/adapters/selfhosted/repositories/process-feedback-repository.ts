import { and, desc, eq } from 'drizzle-orm'

import type { ProcessFeedback } from '@coploy/domain'

import type { ProcessFeedbackRepository } from '../../../interfaces/repositories/process-feedback-repository'
import type { DrizzleDb } from '../db/client'
import { schema } from './helpers'

type Row = typeof schema.processFeedback.$inferSelect

const map = (row: Row): ProcessFeedback => ({
	id: row.id,
	companyId: row.companyId,
	jobId: row.jobId,
	jobAppliedId: row.jobAppliedId,
	userId: row.userId,
	candidateId: row.candidateId,
	stage: row.stage as ProcessFeedback['stage'],
	message: row.message,
	reasonCode: (row.reasonCode ?? null) as ProcessFeedback['reasonCode'],
	nextStep: row.nextStep,
	source: row.source as ProcessFeedback['source'],
	sentBy: row.sentBy,
	sentByName: row.sentByName,
	sentAt: row.sentAt.toISOString(),
})

export function createDrizzleProcessFeedbackRepository(db: DrizzleDb): ProcessFeedbackRepository {
	const table = schema.processFeedback
	return {
		async create(feedback) {
			await db.insert(table).values({
				id: feedback.id,
				companyId: feedback.companyId,
				jobId: feedback.jobId,
				jobAppliedId: feedback.jobAppliedId,
				userId: feedback.userId,
				candidateId: feedback.candidateId,
				stage: feedback.stage,
				message: feedback.message,
				reasonCode: feedback.reasonCode,
				nextStep: feedback.nextStep,
				source: feedback.source,
				sentBy: feedback.sentBy,
				sentByName: feedback.sentByName,
				sentAt: new Date(feedback.sentAt),
			})
		},
		async listByApplication(companyId, jobAppliedId) {
			const rows = await db
				.select()
				.from(table)
				.where(and(eq(table.companyId, companyId), eq(table.jobAppliedId, jobAppliedId)))
				.orderBy(desc(table.sentAt))
			return rows.map(map)
		},
		async listByUser(userId) {
			const rows = await db.select().from(table).where(eq(table.userId, userId)).orderBy(desc(table.sentAt))
			return rows.map(map)
		},
		async deleteByUser(userId) {
			await db.delete(table).where(eq(table.userId, userId))
		},
	}
}
