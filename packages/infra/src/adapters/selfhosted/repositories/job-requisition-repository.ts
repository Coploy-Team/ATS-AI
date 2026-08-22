import { and, desc, eq } from 'drizzle-orm'

import type { JobRequisition, RequisitionStatus } from '@coploy/domain'

import type { JobRequisitionRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { jobRequisitions } from '../db/schema/tables'

function toDomain(row: typeof jobRequisitions.$inferSelect): JobRequisition {
	return {
		id: row.id,
		companyId: row.company_id,
		title: row.title,
		area: row.area,
		reason: row.reason,
		headcount: row.headcount ?? 1,
		salaryRangeMin: row.salaryRangeMin,
		salaryRangeMax: row.salaryRangeMax,
		currency: row.currency,
		requestedByUserId: row.requestedByUserId,
		requestedByName: row.requestedByName,
		status: row.status as RequisitionStatus,
		decidedByUserId: row.decidedByUserId,
		decidedByName: row.decidedByName,
		decidedAt: row.decidedAt,
		decisionNote: row.decisionNote,
		jobId: row.jobId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

export function createSelfHostedJobRequisitionRepository(db: DrizzleDb): JobRequisitionRepository {
	return {
		async listRequisitions(companyId, status) {
			const where = status
				? and(eq(jobRequisitions.company_id, companyId), eq(jobRequisitions.status, status))
				: eq(jobRequisitions.company_id, companyId)
			const rows = await db
				.select()
				.from(jobRequisitions)
				.where(where)
				.orderBy(desc(jobRequisitions.createdAt))
			return rows.map(toDomain)
		},

		async getRequisition(companyId, id) {
			const [row] = await db
				.select()
				.from(jobRequisitions)
				.where(and(eq(jobRequisitions.company_id, companyId), eq(jobRequisitions.id, id)))
				.limit(1)
			return row ? toDomain(row) : null
		},

		async createRequisition(companyId, data) {
			const id = crypto.randomUUID()
			await db.insert(jobRequisitions).values({
				id,
				company_id: companyId,
				title: data.title as string,
				area: (data.area as string) ?? null,
				reason: (data.reason as string) ?? null,
				headcount: (data.headcount as number) ?? 1,
				salaryRangeMin: (data.salaryRangeMin as number) ?? null,
				salaryRangeMax: (data.salaryRangeMax as number) ?? null,
				currency: (data.currency as string) ?? null,
				requestedByUserId: data.requestedByUserId as string,
				requestedByName: (data.requestedByName as string) ?? null,
				status: (data.status as string) ?? 'pending',
			})
			const [row] = await db
				.select()
				.from(jobRequisitions)
				.where(eq(jobRequisitions.id, id))
				.limit(1)
			return toDomain(row) as JobRequisition & { id: string }
		},

		async updateRequisition(companyId, id, data) {
			await db
				.update(jobRequisitions)
				.set({
					...(data.status ? { status: data.status as string } : {}),
					...(data.decidedByUserId !== undefined
						? { decidedByUserId: (data.decidedByUserId as string) ?? null }
						: {}),
					...(data.decidedByName !== undefined
						? { decidedByName: (data.decidedByName as string) ?? null }
						: {}),
					...(data.decidedAt !== undefined ? { decidedAt: data.decidedAt as Date } : {}),
					...(data.decisionNote !== undefined
						? { decisionNote: (data.decisionNote as string) ?? null }
						: {}),
					...(data.jobId !== undefined ? { jobId: (data.jobId as string) ?? null } : {}),
					updatedAt: new Date(),
				})
				.where(and(eq(jobRequisitions.company_id, companyId), eq(jobRequisitions.id, id)))
		},
	}
}
