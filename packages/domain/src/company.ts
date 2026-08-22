import type { EntityRef } from './common'

/**
 * Feature flags por tenant (Talent OS L1).
 * Union tipada — não aceitar string livre; novas flags entram aqui.
 */
export type FeatureFlagKey = 'antiGhosting' | 'applyLite'

export type CompanyFeatureFlags = Partial<Record<FeatureFlagKey, boolean>>

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = [
	'antiGhosting',
	'applyLite',
] as const

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
		/**
		 * Data em que a empresa saiu do plano enterprise para o free.
		 * Usado como "data de corte": entrevistas finalizadas ANTES desta
		 * data não consomem crédito ao serem desbloqueadas (foram pagas
		 * pelo contrato enterprise vigente). Entrevistas finalizadas
		 * APÓS esta data passam a exigir crédito normalmente.
		 *
		 * Setado automaticamente no `handleSubscriptionDeleted` do
		 * stripe-webhook quando `previousPlan === enterprise`.
		 */
		enterpriseEndedAt?: Date | null
	} | null
	subscriptionTrial?: {
		courtesyCreditsGranted?: number | null
		grantedAt?: Date | null
		startAt?: Date | null
	} | null
	features?: {
		useEngineProcessing?: boolean | null
	} | null
	/**
	 * Feature flags opt-in por tenant (default OFF).
	 * Ausência do campo / da chave / `false` = comportamento legado inalterado.
	 * Ortogonal a `subscriptionPlan` — não acoplar.
	 */
	featureFlags?: CompanyFeatureFlags | null
	kanbanCustomColumns?: Array<{
		id: string
		label: string
		color: string
	}> | null
	/**
	 * O que cada etapa dispara quando o candidato entra nela (V2-105).
	 *
	 * Mapa por id de etapa em vez de campo dentro da coluna: as etapas da régua
	 * canônica (`selected`, `approved`…) não são editáveis no catálogo, e é
	 * justamente nelas que a ação faz mais sentido — "entrou em Selecionados,
	 * convida para a entrevista". Guardar dentro da coluna limitaria a
	 * configuração às colunas que a empresa criou.
	 */
	stageActions?: Record<string, string[]> | null
	/** API key for external integrations (authenticated interview URL, etc.) */
	apiKey?: string | null
}

export interface InsightsCache {
	id: string
	company_id?: string | null
	companyId?: string | null
	language?: string | null
	insight?: string | null
	generatedAt?: Date | null
	/** Tamanho da amostra usada para gerar o insight (pra UI mostrar
	 * 'baseado em N entrevistas e M vagas' mesmo após reload da página). */
	sampleSizeInterviews?: number | null
	sampleSizeJobs?: number | null
}
