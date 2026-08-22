import 'stripe'

declare module 'stripe' {
	namespace Stripe {
		// Stripe API 2025+: campos movidos pra subscription.items.data[0].
		// Mantemos como opcional pra suportar payloads de versões antigas.
		interface Subscription {
			current_period_start?: number
			current_period_end?: number
		}
	}
}
