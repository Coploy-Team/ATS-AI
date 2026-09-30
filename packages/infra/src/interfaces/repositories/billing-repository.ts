import type { ListOptions } from '@coploy/domain'
import type { BillingHistory, CreateInput, CreditsUsed, StripeWebhookHistory, SubscriptionHistory } from '@coploy/domain'

export interface BillingRepository {
	listCreditsUsed(companyId: string, options?: ListOptions): Promise<CreditsUsed[]>
	getCreditsUsed(companyId: string, id: string): Promise<CreditsUsed | null>
	createCreditsUsed(companyId: string, data: CreateInput<CreditsUsed>): Promise<CreditsUsed & { id: string }>
	listSubscriptionHistory(companyId: string, options?: ListOptions): Promise<SubscriptionHistory[]>
	/**
	 * Cross-company collectionGroup query. Útil pro admin agregar payments
	 * one-time, renewals, etc. Filtra por timestamp >= sinceUnix (segundos —
	 * mesma unidade gravada pelo webhook handler) e (opcional) por action.
	 */
	listAllSubscriptionHistory(opts?: {
		sinceUnix?: number
		action?: SubscriptionHistory['action']
		limit?: number
	}): Promise<SubscriptionHistory[]>
	createSubscriptionHistory(companyId: string, data: CreateInput<SubscriptionHistory>): Promise<SubscriptionHistory & { id: string }>
	createStripeWebhookHistory(data: CreateInput<StripeWebhookHistory>): Promise<StripeWebhookHistory & { id: string }>
	createBillingHistory(companyId: string, data: CreateInput<BillingHistory>): Promise<BillingHistory & { id: string }>
	listBillingHistory(companyId: string, options?: ListOptions): Promise<BillingHistory[]>
}