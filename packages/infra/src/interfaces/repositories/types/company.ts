import type { CompanyFeatureFlags } from '@coploy/domain'
import type { EntityRef } from './common'

export interface Company {
	id: string
	companyName?: string | null
	companyBio?: string | null
	companLogo?: string | null
	companyCity?: string | null
	companyCountry?: string | null
	companyState?: string | null
	companySize?: string | null
	companyWebsite?: string | null
	companyId?: string | null
	segment?: string | null
	/** Owner reference — may be an EntityRef (normalized) or a raw UID string (legacy). */
	ownerCompany?: EntityRef | string | null
	/** Legacy flat field used by GCP adapter. */
	ownerUserCompanyId?: string | null
	subscriptionPlan?: string | null
	subscriptionStatus?: string | null
	subscriptionId?: string | null
	stripeCustomerId?: string | null
	currentPeriodEnd?: number | null
	trialEnd?: number | null
	objective?: string[] | null
	typeInterview?: string[] | null
	headquartersCountries?: string[] | null
	notificationsEmail?: boolean | null
	notificationReportWeek?: boolean | null
	evaluateInternationalCandidates?: boolean | null
	whatsappBetaAccess?: boolean | null
	retro2025?: string | null
	/** Flat field (GCP). Nested under `features` in selfhosted. */
	featureUseEngineProcessing?: boolean | null
	creditsMonthly?: number | null
	creditsCourtesy?: number | null
	creditsFixed?: number | null
	trialCourtesyCreditsGranted?: number | null
	/** Nested job portal reference (GCP: DocumentReference; normalized to EntityRef). */
	jobPortal?: EntityRef | null
	subscriptionCredits?: {
		creditsMonthly?: number | null
		creditsCourtesy?: number | null
		creditsFixed?: number | null
		creditsTotal?: number | null
	} | null
	subscriptionDetails?: {
		stripeCustomerId?: string | null
		plan?: string | null
		status?: string | null
		startAt?: Date | null
		endAt?: Date | null
	} | null
	subscriptionTrial?: {
		courtesyCreditsGranted?: number | null
		grantedAt?: Date | null
		startAt?: Date | null
	} | null
	features?: {
		useEngineProcessing?: boolean | null
	} | null
	featureFlags?: CompanyFeatureFlags | null
}

export interface InsightsCache {
	id: string
	company_id?: string | null
	companyId?: string | null
	language?: string | null
	insight?: string | null
	generatedAt?: Date | null
}
