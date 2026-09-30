export enum COMPANY_PLANS {
  free = 'free',
  pro = 'pro',
  premium = 'premium',
  enterprise = 'enterprise',
  creditsExtraPremium = 'creditsExtraPremium',
  creditsExtraPro = 'creditsExtraPro',
  dreamJobs = 'dreamJobs',
}

export type AppPlan =
  | COMPANY_PLANS.free
  | COMPANY_PLANS.pro
  | COMPANY_PLANS.premium
  | COMPANY_PLANS.enterprise
  | COMPANY_PLANS.dreamJobs

export enum CREDITS_HISTORY_TYPE {
	grant = 'grant',
	debit = 'debit',
	expire = 'expire',
	adjustment = 'adjustment',
	reversal = 'reversal',
}

export const PLAN_CREDITS: Record<AppPlan, number> = {
  free: 10,
  pro: 10,
  premium: 10,
  enterprise: 0,
  dreamJobs: 0,
}

export enum CREDITS_HISTORY_REASON {
	//grants
	monthly_credits = 'monthly_credits',
	fixed_credits = 'fixed_credits',
	courtesy_credits = 'courtesy_credits',
	//debits
	view_candidate = 'view_candidate',
}

export const COMPANY_FREE_DEFAULTS = {
	COMPANY_COUNTRY: 'Brasil',
	SUBSCRIPTION_PLAN: COMPANY_PLANS.free,
	PLAN: COMPANY_PLANS.free,
	STATUS: 'active',
	CREDITS_MONTHLY: 0,
	CREDITS_FIXED: 0,
	CREDITS_COURTESY: PLAN_CREDITS.free,
	COMPANY_BIO: '',
	STRIPE_CUSTOMER_ID: '',
	COMPANY_INTERVIEWS: [],
	INFO_JOBS: [],
	JOB_PORTAL: null,
	PHOTO_URL: '',
	JOBS_APPLIED: [],
} as const

export const DICEBEAR_LOGO_URL =
	'https://api.dicebear.com/8.x/initials/png?backgroundColor=ffb4e7,ffea83,80e5f4,cdf784&fontFamily=sans-serif&fontSize=36&fontWeight=100&seed='

export { getDiceBearAvatarUrl } from '@coploy/shared'

export const FIREBASE_AUTH_ERRORS = {
	'email-already-in-use': 'Este email já está em uso',
	'weak-password':
		'A senha fornecida não atende aos requisitos mínimos de segurança',
	'invalid-email': 'Email inválido',
} as const
