import type { DomainEvent } from '@coploy/domain'

export type CreateDomainEventInput = {
	id?: string
	type: string
	schemaVersion: string
	companyId: string
	payload: Record<string, unknown>
}

export interface OutboxRepository {
	insert(input: CreateDomainEventInput): Promise<DomainEvent>
	listPending(limit?: number): Promise<DomainEvent[]>
	claimPending(limit?: number): Promise<DomainEvent[]>
	markPublished(id: string): Promise<DomainEvent>
	markFailed(id: string, error: string): Promise<DomainEvent>
}
