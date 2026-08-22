import type { AuditLog, CreateInput } from '@coploy/domain'

export interface AuditLogRepository {
	create(data: CreateInput<AuditLog>): Promise<AuditLog & { id: string }>
	list(opts?: {
		limit?: number
		actor?: string
		action?: string
		scope?: string
		targetType?: string
		targetId?: string
	}): Promise<AuditLog[]>
}
