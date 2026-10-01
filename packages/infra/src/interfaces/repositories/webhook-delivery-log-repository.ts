import type { WebhookDeliveryLog } from '@coploy/domain'

export interface WebhookDeliveryLogRepository {
	listByCompany(companyId: string, limit?: number): Promise<WebhookDeliveryLog[]>
	listByWebhook(webhookId: string, limit?: number): Promise<WebhookDeliveryLog[]>
	/** Cross-company list (admin-only). Newest first. */
	listAll(opts?: { limit?: number; success?: boolean; event?: string }): Promise<WebhookDeliveryLog[]>
	getById(id: string): Promise<WebhookDeliveryLog | null>
	create(data: Omit<WebhookDeliveryLog, 'id'>): Promise<WebhookDeliveryLog & { id: string }>
}
