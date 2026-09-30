import {
	COMPANY_FREE_DEFAULTS,
	COMPANY_PLANS,
} from '@/http/constants/company-free-constants'
import { isPastDate } from './date-formatter'

/**
 * Selfhosted (PostgreSQL) returns native Date objects for timestamp columns,
 * while GCP/Firestore returns ISO strings. Response schemas expect strings,
 * so normalize Date → ISO string here.
 */
function toIsoString(value: unknown): string | null | undefined {
	if (value == null) return value as null | undefined
	if (value instanceof Date) return value.toISOString()
	return value as string
}

export default function normalizePlansCredits(
	subscriptionDetails: any,
	subscriptionCredits: any,
	subscriptionPlan?: string,
) {
	// normalize plan
	// `subscriptionDetails.plan` é a fonte canônica atualizada pelos webhooks Stripe.
	// `subscriptionPlan` (raiz) é um campo legacy que pode estar dessincronizado;
	// fica como fallback apenas para Companies muito antigas que nunca passaram
	// por um webhook de subscription.
	const basePlan =
		subscriptionDetails?.plan || subscriptionPlan || COMPANY_PLANS.free

	const isPaidPlan = ['pro', 'premium'].includes(String(basePlan).toLowerCase())
	const planExpired = isPastDate(subscriptionDetails?.endAt)

	const normalizedPlan =
		isPaidPlan && planExpired ? COMPANY_PLANS.free : basePlan

	//normalize credits
	const creditsMonthlyRaw = subscriptionCredits?.creditsMonthly || 0
	const creditsFixed = subscriptionCredits?.creditsFixed || 0
	const creditsCourtesy = subscriptionCredits?.creditsCourtesy || 0

	const creditsMonthly = planExpired ? 0 : creditsMonthlyRaw
	const creditsTotal = creditsMonthly + creditsFixed + creditsCourtesy

	return {
		subscriptionDetails: {
			...subscriptionDetails,
			plan: normalizedPlan,
			status: subscriptionDetails?.status ?? COMPANY_FREE_DEFAULTS.STATUS,
			startAt: toIsoString(subscriptionDetails?.startAt),
			endAt: toIsoString(subscriptionDetails?.endAt),
		},
		subscriptionCredits: {
			...subscriptionCredits,
			creditsMonthly,
			creditsFixed,
			creditsCourtesy,
			creditsTotal,
		},
	}
}
