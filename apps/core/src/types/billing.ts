export type StripeCustomer = {
	id: string
	email: string
	name: string
	companyId: string
	created: number
}

export type StripeSubscription = {
	id: string
	customerId: string
	status:
		| 'incomplete'
		| 'incomplete_expired'
		| 'trialing'
		| 'active'
		| 'past_due'
		| 'canceled'
		| 'unpaid'
		| 'paused'
	priceId: string
	productId: string
	currentPeriodStart: number
	currentPeriodEnd: number
	cancelAtPeriodEnd: boolean
	trialStart?: number
	trialEnd?: number
	canceledAt?: number
}

export type StripePlan = {
	id: string
	name: string
	description: string
	priceId: string
	productId: string
	amount: number
	currency: string
	interval: 'month' | 'year'
	features: string[]
	popular?: boolean
}

export type BillingInfo = {
	customerId: string
	subscription?: StripeSubscription
	plan?: StripePlan
	paymentMethods: StripePaymentMethod[]
	invoices: StripeInvoice[]
}

export type StripePaymentMethod = {
	id: string
	type: string
	card?: {
		brand: string
		last4: string
		expMonth: number
		expYear: number
	}
	isDefault: boolean
}

export type StripeInvoice = {
	id: string
	status: string
	amountPaid: number
	amountDue: number
	currency: string
	periodStart: number
	periodEnd: number
	invoiceUrl: string
	hosted_invoice_url: string
}

export type CheckoutSession = {
	id: string
	url: string
	customerId: string
	subscriptionId?: string
	mode: 'payment' | 'subscription' | 'setup'
	status: string
}

export type WebhookEvent = {
	id: string
	type: string
	created: number
	data: {
		object: Record<string, unknown>
		previous_attributes?: Record<string, unknown>
	}
}
