import Stripe from 'stripe'
import { env } from '@/env'

// Configuração do cliente Stripe (lazy init para suportar self-hosted sem Stripe)
export const stripe: Stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-08-27.basil',
      typescript: true,
    })
  : (new Proxy({}, {
      get() { throw new Error('Stripe not configured. Set STRIPE_SECRET_KEY to enable billing.') },
    }) as Stripe)

// Classe helper para operações com Stripe
export class StripeService {
  private readonly stripe: Stripe

  constructor() {
    this.stripe = stripe
  }

  // Customer operations
  async createCustomer(params: {
    email: string
    name: string
    metadata?: Record<string, string>
  }): Promise<Stripe.Customer> {
    return await this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata || {},
    })
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId)
      return customer as Stripe.Customer
    } catch {
      return null
    }
  }

  async updateCustomer(
    customerId: string,
    params: Stripe.CustomerUpdateParams
  ): Promise<Stripe.Customer> {
    return await this.stripe.customers.update(customerId, params)
  }

  // Subscription operations
  async createSubscription(params: {
    customerId: string
    priceId: string
    metadata?: Record<string, string>
    trialPeriodDays?: number
  }): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.create({
      customer: params.customerId,
      items: [{ price: params.priceId }],
      metadata: params.metadata || {},
      trial_period_days: params.trialPeriodDays,
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    })
  }

  async getSubscription(
    subscriptionId: string
  ): Promise<Stripe.Subscription | null> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId)
    } catch {
      return null
    }
  }

  async updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams
  ): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.update(subscriptionId, params)
  }

  async cancelSubscription(
    subscriptionId: string,
    atPeriodEnd = true
  ): Promise<Stripe.Subscription> {
    return await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: atPeriodEnd,
    })
  }

  // Checkout operations
  async createCheckoutSession(params: {
    customerId: string
    priceId: string
    successUrl: string
    cancelUrl: string
    quantity: number
    mode: 'payment' | 'subscription'
    metadata?: Record<string, string>
  }): Promise<Stripe.Checkout.Session> {
    let planSlug: string | undefined
    try {
      const price = await this.stripe.prices.retrieve(params.priceId, {
        expand: ['product'],
      })
      const product = price.product as Stripe.Product
      planSlug =
        (price.metadata?.planSlug as string) ??
        (product?.metadata?.planSlug as string)
    } catch {
      // Ignora erro se não conseguir buscar o price/product - planSlug fica undefined
    }

    // quantity sanitizada (≥ 1)
    const quantity = Math.max(1, params.quantity ?? 1)

    // Metadados que queremos tanto na Session quanto no PaymentIntent
    const baseMetadata = {
      ...(params.metadata || {}),
      quantity: String(quantity),
      ...(planSlug ? { planSlug } : {}),
    }

    return await this.stripe.checkout.sessions.create({
      customer: params.customerId,
      mode: params.mode,
      line_items: [
        {
          price: params.priceId,
          quantity,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: baseMetadata,

      ...(params.mode === 'payment'
        ? {
            payment_intent_data: {
              metadata: baseMetadata,
            },
          }
        : {}),

      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer_update: {
        name: 'auto',
        address: 'auto',
      },
    })
  }

  async getCheckoutSession(
    sessionId: string
  ): Promise<Stripe.Checkout.Session | null> {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId)
    } catch {
      return null
    }
  }

  // Invoice operations
  async getInvoices(customerId: string, limit = 10): Promise<Stripe.Invoice[]> {
    const invoices = await this.stripe.invoices.list({
      customer: customerId,
      limit,
    })
    return invoices.data
  }

  async getInvoice(invoiceId: string): Promise<Stripe.Invoice | null> {
    try {
      return await this.stripe.invoices.retrieve(invoiceId)
    } catch {
      return null
    }
  }

  // Payment Methods operations
  async getPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    const paymentMethods = await this.stripe.paymentMethods.list({
      customer: customerId,
    })
    return paymentMethods.data
  }

  // Product operations
  async getProducts(): Promise<Stripe.Product[]> {
    const products = await this.stripe.products.list({
      active: true,
      expand: ['data.default_price'],
    })
    return products.data
  }

  /** Um produto pelo id — a listagem inteira só para ler um `metadata` é desperdício. */
  async getProduct(productId: string): Promise<Stripe.Product | null> {
    try {
      return await this.stripe.products.retrieve(productId)
    } catch {
      return null
    }
  }

  async getPrice(priceId: string): Promise<Stripe.Price | null> {
    try {
      return await this.stripe.prices.retrieve(priceId)
    } catch {
      return null
    }
  }

  async getPricesByProductAndCurrency(
    productId: string,
    currency: string
  ): Promise<Stripe.Price[]> {
    const allPrices = await this.stripe.prices.list({
      product: productId,
      active: true,
    })

    const pricesInCurrency = allPrices.data.filter(
      (price) => price.currency.toLowerCase() === currency.toLowerCase()
    )

    return pricesInCurrency
  }

  async getAllPricesByProduct(productId: string): Promise<Stripe.Price[]> {
    const prices = await this.stripe.prices.list({
      product: productId,
      active: true,
    })
    return prices.data
  }

  async findPriceByProductAndCurrency(
    productId: string,
    currency: string,
    type?: 'recurring' | 'one_time'
  ): Promise<Stripe.Price | null> {
    const allPrices = await this.stripe.prices.list({
      product: productId,
      active: true,
    })

    const pricesInCurrency = allPrices.data.filter(
      (price) => price.currency.toLowerCase() === currency.toLowerCase()
    )

    if (type) {
      const filtered = pricesInCurrency.filter(
        (price) =>
          (type === 'recurring' && price.type === 'recurring') ||
          (type === 'one_time' && price.type === 'one_time')
      )
      return filtered[0] || null
    }

    return pricesInCurrency[0] || null
  }

  // Webhook operations
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, secret)
  }

  // Portal operations
  async createBillingPortalSession(params: {
    customerId: string
    returnUrl: string
  }): Promise<Stripe.BillingPortal.Session> {
    return await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    })
  }
}

// Instância singleton do serviço
export const stripeService = new StripeService()
