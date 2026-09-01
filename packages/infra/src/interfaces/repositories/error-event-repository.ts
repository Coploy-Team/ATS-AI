import type { ErrorEvent } from '@coploy/domain'

export interface ErrorEventRepository {
	/** Lista todos os eventos (mais recentes primeiro). Admin-only. */
	listAll(opts?: {
		limit?: number
		resolved?: boolean
		companyId?: string
		interviewId?: string
		service?: string
	}): Promise<ErrorEvent[]>
	listByCompany(companyId: string, limit?: number): Promise<ErrorEvent[]>
	listByInterview(interviewId: string, limit?: number): Promise<ErrorEvent[]>
	getById(id: string): Promise<ErrorEvent | null>
	create(data: Omit<ErrorEvent, 'id'>): Promise<ErrorEvent & { id: string }>
	markResolved(id: string, resolvedBy: string): Promise<void>
	/**
	 * Conta eventos via aggregation server-side. Substitui `listAll().length`.
	 * Retorna `null` quando a aggregation falha (índice ausente, etc) — caller
	 * decide o fallback.
	 */
	count(filters?: {
		resolved?: boolean
		companyId?: string
		interviewId?: string
		service?: string
	}): Promise<number | null>
}
