import { z } from 'zod'

export const StripeCustomerSchema = z.object({
	id: z.string(),
	email: z.string().email(),
	name: z.string(),
	companyId: z.string(),
	created: z.number(),
})

export const StripeSubscriptionSchema = z.object({
	id: z.string(),
	customerId: z.string(),
	status: z.enum([
		'incomplete',
		'incomplete_expired',
		'trialing',
		'active',
		'past_due',
		'canceled',
		'unpaid',
		'paused',
	]),
	priceId: z.string(),
	productId: z.string(),
	currentPeriodStart: z.number(),
	currentPeriodEnd: z.number(),
	cancelAtPeriodEnd: z.boolean(),
	trialStart: z.number().optional(),
	trialEnd: z.number().optional(),
	canceledAt: z.number().optional(),
})

export const StripePlanSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	description: z.string(),
	priceId: z.string(),
	productId: z.string(),
	amount: z.number(),
	currency: z.string(),
	/**
	 * `null` em preço avulso — pacote não tem intervalo.
	 *
	 * Era `enum(['month','year'])` e a rota preenchia com `'month'` quando o
	 * Stripe dizia `recurring: null`. Ou seja: todo pacote aparecia como
	 * assinatura mensal, e a tela cobraria "por mês" o que se paga uma vez.
	 */
	interval: z.enum(['month', 'year']).nullable(),
	/** O que o cliente precisa saber para escolher o `mode` do checkout. */
	type: z.enum(['recurring', 'one_time']),
	/**
	 * Quantos créditos a compra concede.
	 *
	 * Vem de `PLAN_CREDITS` — a MESMA constante que o webhook usa para creditar.
	 * O catálogo do Stripe traz `description` e `features` vazios (ninguém
	 * mantém metadado de produto), então a tela de compra mostrava só um preço,
	 * sem dizer o que ele compra. Derivar daqui impede o caso pior: a tela
	 * prometer um número e o sistema conceder outro.
	 */
	credits: z.number(),
	features: z.string(),
	popular: z.boolean().optional(),
})

export const StripePaymentMethodSchema = z.object({
	id: z.string(),
	type: z.string(),
	card: z
		.object({
			brand: z.string(),
			last4: z.string(),
			expMonth: z.number(),
			expYear: z.number(),
		})
		.optional(),
	isDefault: z.boolean(),
})

export const StripeInvoiceSchema = z.object({
	id: z.string(),
	status: z.string(),
	amountPaid: z.number(),
	amountDue: z.number(),
	currency: z.string(),
	periodStart: z.number(),
	periodEnd: z.number().nullable(),
	invoiceUrl: z.string(),
	hosted_invoice_url: z.string(),
})

export const BillingInfoSchema = z.object({
	customerId: z.string(),
	subscription: StripeSubscriptionSchema.optional(),
	plan: StripePlanSchema.optional(),
	paymentMethods: z.array(StripePaymentMethodSchema),
	invoices: z.array(StripeInvoiceSchema),
})

export const CheckoutSessionSchema = z.object({
	id: z.string(),
	url: z.string(),
	customerId: z.string(),
	subscriptionId: z.string().optional(),
	mode: z.enum(['payment', 'subscription']),
	status: z.string(),
})

export const CreateCheckoutSessionRequestSchema = z.object({
	priceId: z.string(),
	successUrl: z.string().url(),
	cancelUrl: z.string().url(),
	quantity: z.number().default(1),
	mode: z.enum(['payment', 'subscription']).default('subscription'),
	currency: z.string().length(3).transform((val) => val.toLowerCase()).default('brl'),
})

export const WebhookEventSchema = z.object({
	id: z.string(),
	type: z.string(),
	created: z.number(),
	data: z.object({
		object: z.any(),
		previous_attributes: z.any().optional(),
	}),
})

// Tipos inferidos dos schemas
export type StripeCustomer = z.infer<typeof StripeCustomerSchema>
export type StripeSubscription = z.infer<typeof StripeSubscriptionSchema>
export type StripePlan = z.infer<typeof StripePlanSchema>
export type StripePaymentMethod = z.infer<typeof StripePaymentMethodSchema>
export type StripeInvoice = z.infer<typeof StripeInvoiceSchema>
export type BillingInfo = z.infer<typeof BillingInfoSchema>
export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>
export type CreateCheckoutSessionRequest = z.infer<
	typeof CreateCheckoutSessionRequestSchema
>
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
