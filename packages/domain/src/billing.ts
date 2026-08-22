export interface CreditsUsed {
	id: string
	companyOwner?: string | null
	/**
	 * De onde o crédito foi debitado. `enterprise` aparece no dado real desde
	 * que o plano por contrato entrou — o tipo previa só `enterprise_grace` e
	 * ficou defasado.
	 */
	debitedFrom?: 'monthly' | 'fixed' | 'courtesy' | 'enterprise' | 'enterprise_grace' | null
	feature?: string | null
	ip?: string | null
	jobApplied?: string | null
	postJobId?: string | null
	userId?: string | null
	source?: string | null
	usedAt?: Date | null
	usedBy?: string | null
	usedByName?: string | null
	userAgent?: string | null
	jobName?: string | null
	candidateName?: string | null
	score?: string | number | null
	isHunting?: boolean | null
}

export interface SubscriptionHistory {
	id: string
	action:
		| 'created'
		| 'updated'
		| 'deleted'
		| 'payment_success'
		| 'payment_failed'
		| 'checkout_completed'
		| 'admin_sync_expired_saas'
	operationId?: string
	mode?: string
	customerId: string
	status?:
		| 'incomplete'
		| 'incomplete_expired'
		| 'trialing'
		| 'active'
		| 'past_due'
		| 'canceled'
		| 'unpaid'
		| 'paused'
		| 'payment_failed'
	plan?: string
	timestamp: number
	details?: {
		previousStatus?: string
		newStatus?: string
		currentPeriodEnd?: number
		trialEnd?: number
		amount?: number
		currency?: string
		eventId?: string
		reason?: string
		previousPlan?: string
		newPlan?: string
		metadata?: Record<string, any>
	}
	eventId?: string
	createdAt?: number
	subscriptionId?: string
}

export interface Nps {
	id: string
	companyId: string
	jobId: string
	jobName: string
	candidateId: string
	candidateName: string
	candidateEmail: string
	jobApplied: string
	photo_url?: string
	score: number
	comment: string
	interviewType: 'exitJob' | 'evaluation' | 'interview' | 'emotional'
	createdAt: Date
	updatedAt?: Date
	company?: { id: string; path?: string }
	job?: { id: string; path?: string }
	candidate?: { id: string; path?: string }
}

export interface BillingHistory {
	id: string
	companyId?: string
	action?: string
	/** Alias for action — used by some callers */
	type?: string
	timestamp: number
	details?: Record<string, any>
	/** Arbitrary payload — used by some callers */
	data?: Record<string, any>
}

export interface StripeWebhookHistory {
	id: string
	eventId?: string
	eventType?: string
	/** Raw Stripe event type string — used by stripe-webhook.ts */
	event?: string
	processedAt?: number
	success?: boolean
	error?: string
	[key: string]: unknown
}
