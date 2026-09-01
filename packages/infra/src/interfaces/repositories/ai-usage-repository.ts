import type { AiUsageEvent } from '@coploy/domain'

export interface AiUsageListOptions {
	companyId?: string
	month?: string
	limit?: number
}

export interface AiUsageRepository {
	create(data: Omit<AiUsageEvent, 'id' | 'createdAt'>): Promise<AiUsageEvent & { id: string }>
	list(options?: AiUsageListOptions): Promise<AiUsageEvent[]>
}
