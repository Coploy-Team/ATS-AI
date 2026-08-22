import { randomUUID } from 'node:crypto'
import type { Firestore, Transaction } from 'firebase-admin/firestore'
import type { DomainEvent, DomainEventStatus } from '@coploy/domain'
import type {
	CreateDomainEventInput,
	OutboxRepository,
} from '../../../interfaces/repositories/outbox-repository'

const OUTBOX = 'domainEventsOutbox'

function toIso(value: unknown): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'object' && value !== null && 'toDate' in value) {
		const d = (value as { toDate: () => Date }).toDate()
		return d instanceof Date ? d.toISOString() : null
	}
	return null
}

function mapEvent(id: string, data: Record<string, unknown>): DomainEvent {
	return {
		id,
		type: String(data.type),
		schemaVersion: String(data.schemaVersion),
		companyId: String(data.companyId),
		payload: (data.payload as Record<string, unknown> | null) ?? {},
		createdAt: toIso(data.createdAt) ?? new Date(0).toISOString(),
		status: data.status as DomainEventStatus,
		retryCount: Number(data.retryCount ?? 0),
		lastError: (data.lastError as string | null) ?? null,
		publishedAt: toIso(data.publishedAt),
		failedAt: toIso(data.failedAt),
		updatedAt: toIso(data.updatedAt),
	}
}

async function loadById(
	db: Firestore,
	id: string,
	tx?: Transaction,
): Promise<DomainEvent> {
	const ref = db.collection(OUTBOX).doc(id)
	const snap = tx ? await tx.get(ref) : await ref.get()
	if (!snap.exists) throw new Error('Domain event not found')
	return mapEvent(snap.id, snap.data()!)
}

export function createFirestoreOutboxRepository(db: Firestore): OutboxRepository {
	return {
		async insert(input: CreateDomainEventInput) {
			const id = input.id ?? randomUUID()
			const now = new Date()
			const payload = {
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
			await db.collection(OUTBOX).doc(id).create(payload)
			return mapEvent(id, payload)
		},

		async listPending(limit = 100) {
			const snap = await db
				.collection(OUTBOX)
				.where('status', '==', 'pending')
				.orderBy('createdAt', 'asc')
				.limit(limit)
				.get()
			return snap.docs.map((doc) => mapEvent(doc.id, doc.data()))
		},

		async claimPending(limit = 100) {
			const snap = await db
				.collection(OUTBOX)
				.where('status', '==', 'pending')
				.orderBy('createdAt', 'asc')
				.limit(limit)
				.get()
			const claimed: DomainEvent[] = []

			for (const doc of snap.docs) {
				const event = await db.runTransaction(async (tx) => {
					const ref = db.collection(OUTBOX).doc(doc.id)
					const current = await tx.get(ref)
					if (!current.exists || current.data()?.status !== 'pending') return null
					const now = new Date()
					tx.update(ref, {
						status: 'publishing',
						lastError: null,
						updatedAt: now,
					})
					return mapEvent(current.id, {
						...current.data()!,
						status: 'publishing',
						lastError: null,
						updatedAt: now,
					})
				})
				if (event) claimed.push(event)
			}

			return claimed
		},

		async markPublished(id: string) {
			const now = new Date()
			await db.collection(OUTBOX).doc(id).update({
				status: 'published',
				publishedAt: now,
				updatedAt: now,
			})
			return loadById(db, id)
		},

		async markFailed(id: string, error: string) {
			return db.runTransaction(async (tx) => {
				const ref = db.collection(OUTBOX).doc(id)
				const current = await loadById(db, id, tx)
				const now = new Date()
				tx.update(ref, {
					status: 'failed',
					retryCount: (current.retryCount ?? 0) + 1,
					lastError: error,
					failedAt: now,
					updatedAt: now,
				})
				return {
					...current,
					status: 'failed',
					retryCount: (current.retryCount ?? 0) + 1,
					lastError: error,
					failedAt: now.toISOString(),
					updatedAt: now.toISOString(),
				}
			})
		},
	}
}
