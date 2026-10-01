import { and, desc, eq } from 'drizzle-orm'

import type { InterviewSchedule } from '@coploy/domain'

import type { InterviewScheduleRepository } from '../../../interfaces/repositories/interview-schedule-repository'
import type { DrizzleDb } from '../db/client'
import { schema } from './helpers'

type Row = typeof schema.interviewSchedules.$inferSelect

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null)

const map = (row: Row): InterviewSchedule => ({
	id: row.id,
	companyId: row.companyId,
	jobId: row.jobId,
	jobAppliedId: row.jobAppliedId,
	userId: row.userId,
	candidateId: row.candidateId,
	format: row.format as InterviewSchedule['format'],
	durationMinutes: row.durationMinutes,
	timezone: row.timezone,
	slots: (Array.isArray(row.slots) ? row.slots : []) as InterviewSchedule['slots'],
	status: row.status as InterviewSchedule['status'],
	confirmedSlot: (row.confirmedSlot ?? null) as InterviewSchedule['confirmedSlot'],
	expiresAt: iso(row.expiresAt),
	note: row.note,
	joinDetails: (row.joinDetails ?? null) as InterviewSchedule['joinDetails'],
	declineReason: (row.declineReason ?? null) as InterviewSchedule['declineReason'],
	declineNote: row.declineNote,
	respondedAt: iso(row.respondedAt),
	respondedVia: (row.respondedVia ?? null) as InterviewSchedule['respondedVia'],
	proposedBy: row.proposedBy,
	proposedByName: row.proposedByName,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString(),
})

/** Campo a campo, e datas em Date: o selfhosted não aceita string ISO em timestamptz pelo driver. */
function toRow(patch: Partial<InterviewSchedule>): Record<string, unknown> {
	const row: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(patch)) {
		if (key === 'id' || value === undefined) continue
		row[key] = ['expiresAt', 'respondedAt', 'createdAt', 'updatedAt'].includes(key) && typeof value === 'string'
			? new Date(value)
			: value
	}
	return row
}

export function createDrizzleInterviewScheduleRepository(db: DrizzleDb): InterviewScheduleRepository {
	const table = schema.interviewSchedules
	return {
		async create(schedule) {
			await db.insert(table).values({ id: schedule.id, ...toRow(schedule) } as never)
		},
		async getById(id) {
			const rows = await db.select().from(table).where(eq(table.id, id)).limit(1)
			return rows[0] ? map(rows[0]) : null
		},
		async update(id, patch) {
			const rows = await db
				.update(table)
				.set({ ...toRow(patch), updatedAt: new Date() } as never)
				.where(eq(table.id, id))
				.returning()
			return rows[0] ? map(rows[0]) : null
		},
		async listByApplication(companyId, jobAppliedId) {
			const rows = await db
				.select()
				.from(table)
				.where(and(eq(table.companyId, companyId), eq(table.jobAppliedId, jobAppliedId)))
				.orderBy(desc(table.createdAt))
			return rows.map(map)
		},
		async listByUser(userId) {
			const rows = await db.select().from(table).where(eq(table.userId, userId)).orderBy(desc(table.createdAt))
			return rows.map(map)
		},
		async deleteByUser(userId) {
			await db.delete(table).where(eq(table.userId, userId))
		},
	}
}
