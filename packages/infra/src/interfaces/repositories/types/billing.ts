export interface CreditsUsed {
	id: string
	companyOwner?: string | null
	debitedFrom?: 'monthly' | 'fixed' | 'courtesy' | 'enterprise_grace' | null
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
}

export interface Nps {
	id: string
}

export interface BillingHistory {
	id: string
}

export interface StripeWebhookHistory {
	id: string
}
