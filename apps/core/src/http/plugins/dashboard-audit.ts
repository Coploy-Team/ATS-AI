import type { InfraProvider } from '@coploy/infra'

export interface DashboardAuditInput {
	action: string
	userId: string
	companyId: string | null
	resource: string
	resourceId?: string | null
	metadata?: Record<string, unknown> | null
}

/**
 * Audit entry for dashboard CRUD operations.
 *
 * Awaitable. O caller deve `await` antes de retornar a response — em
 * Cloud Run, fire-and-forget pode ser cortado quando a instância
 * congela/escala-down após a response, perdendo o write no Firestore.
 *
 * Falha de log nunca propaga: o try/catch interno garante que o caller
 * pode `await` sem precisar tratar erro de auditoria.
 */
export async function recordDashboardAudit(
	infra: InfraProvider,
	input: DashboardAuditInput,
): Promise<void> {
	try {
		await infra.auditLogRepository.create({
			at: new Date(),
			actor: input.userId,
			actorRole: null,
			action: input.action,
			target: input.companyId
				? `${input.resource}:${input.companyId}`
				: input.resource,
			targetType: input.resource,
			targetId: input.resourceId ?? null,
			scope: input.companyId,
			metadata: input.metadata ?? null,
		})
	} catch (err) {
		console.error('[dashboard-audit] recordDashboardAudit failed:', err)
	}
}
