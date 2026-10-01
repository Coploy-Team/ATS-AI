import { asc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DomainEvent, DomainEventStatus } from '@coploy/domain'
import type {
	CreateDomainEventInput,
	OutboxRepository,
} from '../../../interfaces/repositories/outbox-repository'
import type { DrizzleDb } from '../db/client'
import { schema } from './helpers'

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	return value.toISOString()
}

function mapEvent(row: typeof schema.domainEventsOutbox.$inferSelect): DomainEvent {
	return {
		id: row.id,
		type: row.type,
		schemaVersion: row.schemaVersion,
		companyId: row.companyId,
		payload: (row.payload as Record<string, unknown> | null) ?? {},
		createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
		status: row.status as DomainEventStatus,
		retryCount: row.retryCount,
		lastError: row.lastError ?? null,
		publishedAt: toIso(row.publishedAt),
		failedAt: toIso(row.failedAt),
		updatedAt: toIso(row.updatedAt),
	}
}

export function createDrizzleOutboxRepository(db: DrizzleDb): OutboxRepository {
	async function loadById(id: string): Promise<DomainEvent> {
		const rows = await db
			.select()
			.from(schema.domainEventsOutbox)
			.where(eq(schema.domainEventsOutbox.id, id))
			.limit(1)
		if (!rows[0]) throw new Error('Domain event not found')
		return mapEvent(rows[0])
	}

	return {
		async insert(input: CreateDomainEventInput) {
			const now = new Date()
			const row = {
				id: input.id ?? randomUUID(),
				type: input.type,
				schemaVersion: input.schemaVersion,
				companyId: input.companyId,
				payload: input.payload,
				status: 'pending',
				retryCount: 0,
				lastError: null,
				publishedAt: null,
				failedAt: null,
				createdAt: now,
				updatedAt: now,
			}
			await db.insert(schema.domainEventsOutbox).values(row)
			return mapEvent(row)
		},

		async listPending(limit = 100) {
			const rows = await db
				.select()
				.from(schema.domainEventsOutbox)
				.where(eq(schema.domainEventsOutbox.status, 'pending'))
				.orderBy(asc(schema.domainEventsOutbox.createdAt))
				.limit(limit)
			return rows.map(mapEvent)
		},

		async claimPending(limit = 100) {
			const candidates = await db
				.select({ id: schema.domainEventsOutbox.id })
				.from(schema.domainEventsOutbox)
				.where(eq(schema.domainEventsOutbox.status, 'pending'))
				.orderBy(asc(schema.domainEventsOutbox.createdAt))
				.limit(limit)
			const claimed: DomainEvent[] = []

			for (const candidate of candidates) {
				const rows = await db
					.update(schema.domainEventsOutbox)
					.set({
						status: 'publishing',
						lastError: null,
						updatedAt: new Date(),
					})
					.where(
						sql`${schema.domainEventsOutbox.id} = ${candidate.id} AND ${schema.domainEventsOutbox.status} = 'pending'`,
					)
					.returning()

				if (rows[0]) claimed.push(mapEvent(rows[0]))
			}

			return claimed
		},

		async markPublished(id: string) {
			const now = new Date()
			await db
				.update(schema.domainEventsOutbox)
				.set({
					status: 'published',
					publishedAt: now,
					updatedAt: now,
				})
				.where(eq(schema.domainEventsOutbox.id, id))
			return loadById(id)
		},

		async markFailed(id: string, error: string) {
			const now = new Date()
			await db
				.update(schema.domainEventsOutbox)
				.set({
					status: 'failed',
					retryCount: sql`${schema.domainEventsOutbox.retryCount} + 1`,
					lastError: error,
					failedAt: now,
					updatedAt: now,
				})
				.where(eq(schema.domainEventsOutbox.id, id))
			return loadById(id)
		},
	}
}
