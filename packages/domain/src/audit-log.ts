/** Internal admin audit trail. Each entry records a sensitive action performed
 *  by a Coploy team member (or the system) in the Coploy Admin. */
export interface AuditLog {
	id: string
	at: Date
	/** Email of the admin who performed the action, or "system" for automated events. */
	actor: string
	/** Role of the actor at the time. */
	actorRole?: 'admin_master' | 'suporte' | 'comercial' | 'system' | null
	/** Short identifier of what happened — dot-separated convention.
	 *  e.g. interview.reprocess, interview.delete, user.reset_password,
	 *  user.block, user.unblock, user.delete, admin.invite, admin.update,
	 *  admin.revoke. */
	action: string
	/** Human-readable description of the affected entity. */
	target: string
	/** Optional structured target identifier (companyId, interviewId, etc). */
	targetType?: string | null
	targetId?: string | null
	/** High-level grouping for filtering (matches actorRole or 'automation'). */
	scope?: string | null
	/** Free-form structured metadata about the action. */
	metadata?: Record<string, unknown> | null
}
