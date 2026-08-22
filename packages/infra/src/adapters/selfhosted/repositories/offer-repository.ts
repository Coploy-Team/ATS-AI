import { and, desc, eq } from 'drizzle-orm'

import type { Offer, OfferStatus } from '@coploy/domain'

import type { OfferRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { offers } from '../db/schema/tables'

function toDomain(row: typeof offers.$inferSelect): Offer {
	return {
		id: row.id,
		companyId: row.company_id,
		jobId: row.jobId,
		candidateId: row.candidateId,
		salaryMinor: row.salaryMinor,
		currency: row.currency,
		contractType: row.contractType,
		startDate: row.startDate,
		notes: row.notes,
		status: row.status as OfferStatus,
		sentAt: row.sentAt,
		respondedAt: row.respondedAt,
		declineReason: row.declineReason,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	}
}

export function createSelfHostedOfferRepository(db: DrizzleDb): OfferRepository {
	return {
		async listOffers(companyId, jobId, candidateId) {
			const rows = await db
				.select()
				.from(offers)
				.where(
					and(
						eq(offers.company_id, companyId),
						eq(offers.jobId, jobId),
						eq(offers.candidateId, candidateId),
					),
				)
				.orderBy(desc(offers.createdAt))
			return rows.map(toDomain)
		},

		async getOffer(companyId, id) {
			const [row] = await db
				.select()
				.from(offers)
				.where(and(eq(offers.company_id, companyId), eq(offers.id, id)))
				.limit(1)
			return row ? toDomain(row) : null
		},

		async createOffer(companyId, data) {
			const id = crypto.randomUUID()
			await db.insert(offers).values({
				id,
				company_id: companyId,
				jobId: data.jobId as string,
				candidateId: data.candidateId as string,
				salaryMinor: data.salaryMinor as number,
				currency: (data.currency as string) ?? 'BRL',
				contractType: (data.contractType as string) ?? null,
				startDate: (data.startDate as Date) ?? null,
				notes: (data.notes as string) ?? null,
				status: (data.status as string) ?? 'draft',
				createdByUserId: data.createdByUserId as string,
			})
			const [row] = await db.select().from(offers).where(eq(offers.id, id)).limit(1)
			return toDomain(row) as Offer & { id: string }
		},

		async updateOffer(companyId, id, data) {
			await db
				.update(offers)
				.set({
					...(data.status ? { status: data.status as string } : {}),
					...(data.sentAt !== undefined ? { sentAt: data.sentAt as Date } : {}),
					...(data.respondedAt !== undefined ? { respondedAt: data.respondedAt as Date } : {}),
					...(data.declineReason !== undefined
						? { declineReason: (data.declineReason as string) ?? null }
						: {}),
					updatedAt: new Date(),
				})
				.where(and(eq(offers.company_id, companyId), eq(offers.id, id)))
		},
	}
}
