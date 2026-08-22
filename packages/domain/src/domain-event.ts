export type DomainEventStatus = 'pending' | 'publishing' | 'published' | 'failed'

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
	id: string
	type: string
	schemaVersion: string
	companyId: string
	payload: TPayload
	createdAt: string
	status: DomainEventStatus
	retryCount?: number
	lastError?: string | null
	publishedAt?: string | null
	failedAt?: string | null
	updatedAt?: string | null
}
