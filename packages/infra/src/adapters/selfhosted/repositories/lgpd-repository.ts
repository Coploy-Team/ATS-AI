import type { ConsentRecord, DataSubjectRequest } from '@coploy/domain'

import type { LgpdRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { cast, cleanForDb, eq, postProcess, randomUUID, schema, toJsonSafe } from './helpers'

export function createSelfHostedLgpdRepository(db: DrizzleDb): LgpdRepository {
	return {
		async listConsents(userId) {
			const rows = await db
				.select()
				.from(schema.dataConsents)
				.where(eq(schema.dataConsents.userId, userId))
			return rows.map((row) =>
				cast<ConsentRecord>(postProcess(schema.dataConsents, row as Record<string, unknown>)),
			)
		},
		async createConsent(data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			await db
				.insert(schema.dataConsents)
				.values({ id, ...cleanForDb(schema.dataConsents, payload) } as never)
			return { ...payload, id } as unknown as ConsentRecord & { id: string }
		},
		async revokeConsent(id, revokedAt) {
			await db
				.update(schema.dataConsents)
				.set({ granted: false, revokedAt } as never)
				.where(eq(schema.dataConsents.id, id))
		},

		async listRequests(userId) {
			const rows = await db
				.select()
				.from(schema.dataSubjectRequests)
				.where(eq(schema.dataSubjectRequests.userId, userId))
			return rows.map((row) =>
				cast<DataSubjectRequest>(
					postProcess(schema.dataSubjectRequests, row as Record<string, unknown>),
				),
			)
		},
		async createRequest(data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			await db
				.insert(schema.dataSubjectRequests)
				.values({ id, ...cleanForDb(schema.dataSubjectRequests, payload) } as never)
			return { ...payload, id } as unknown as DataSubjectRequest & { id: string }
		},
		async completeRequest(id, data) {
			await db
				.update(schema.dataSubjectRequests)
				.set({
					status: data.status,
					completedAt: new Date(),
					...(data.affected ? { affected: data.affected } : {}),
					...(data.error ? { error: data.error } : {}),
				} as never)
				.where(eq(schema.dataSubjectRequests.id, id))
		},
	}
}
