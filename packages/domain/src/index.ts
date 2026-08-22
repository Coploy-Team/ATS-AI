// ── Common ───────────────────────────────────────────────────────────
export type { EntityRef, CreateInput, UpdateInput } from './common'

// ── Repository query types ───────────────────────────────────────────
export type {
	ComparisonOperator,
	QueryFilter,
	ListOptions,
	CompoundOrderBy,
	CompoundCursorEntry,
} from './list-options'

// ── Entities ─────────────────────────────────────────────────────────
export type {
	Company,
	CompanyFeatureFlags,
	FeatureFlagKey,
	InsightsCache,
} from './company'
export { FEATURE_FLAG_KEYS } from './company'
export type { User, UsersCompany } from './user'
export type { Pessoa, PessoaLink, PessoaLinkType, PessoaRole } from './pessoa'
export { assertValidCpf, isValidCpf, maskCpf, normalizeCpf } from './pessoa'
export type { DomainEvent, DomainEventStatus } from './domain-event'
export type { RejectionReason } from './rejection-reason'
export {
	REJECTION_REASONS,
	REJECTION_REASON_TAXONOMY_VERSION,
	findRejectionReason,
	getCandidateVisibility,
} from './rejection-reason'
export type { PipelineStage, StageAction } from './pipeline-stage'
export type {
	Scorecard,
	ScorecardCriterion,
	ScorecardRecommendation,
} from './scorecard'
export { SCORECARD_RECOMMENDATIONS, scorecardAverage } from './scorecard'
export type { CandidateTimelineEntry, TimelineEventType } from './candidate-timeline'
export { TIMELINE_EVENT_TYPES, isEditableEntry } from './candidate-timeline'
export type { EmailTemplate, EmailTemplateKind } from './email-template'
export {
	EMAIL_TEMPLATE_KINDS,
	EMAIL_TEMPLATE_VARIABLES,
	renderTemplate,
	validateTemplate,
} from './email-template'
export type { OrgUnit, OrgUnitKind } from './org-unit'
export { ORG_UNIT_KINDS, orgUnitPath } from './org-unit'
export type {
	CustomFieldDefinition,
	CustomFieldEntity,
	CustomFieldType,
	CustomFieldValues,
} from './custom-field'
export { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, validateCustomFields } from './custom-field'
export type { HiringInfo, Offer, OfferStatus } from './offer'
export { OFFER_STATUSES, canSendOffer, isOfferOpen } from './offer'
export type { JobRequisition, RequisitionStatus } from './job-requisition'
export { REQUISITION_STATUSES, canCreateJobFrom } from './job-requisition'
export type { Capability, TenantRole } from './rbac'
export {
	CAPABILITIES,
	DEFAULT_TENANT_ROLE,
	TENANT_ROLES,
	can,
	capabilitiesOf,
	normalizeTenantRole,
} from './rbac'
export {
	LEGACY_REQUIRED_STAGE_IDS,
	PIPELINE_STAGES,
	PIPELINE_STAGE_IDS,
	STAGE_ACTIONS,
	STAGE_ACTION_FORBIDDEN_STAGES,
	stageAcceptsActions,
	findPipelineStage,
	isTerminalStage,
	normalizeStageId,
} from './pipeline-stage'
export type {
	CandidateProfile,
	CandidateProfileSource,
	CandidateExperience,
	CandidateEducation,
	CandidateLanguage,
	CandidateCertification,
	LanguageProficiency,
} from './candidate-profile'
export type {
	PostJob,
	ScreeningKnockoutNode,
	ScreeningKnockoutQuestionType,
	ScreeningKnockoutRule,
	ScreeningKnockoutRuleOperator,
	ScreeningKnockoutRuleValue,
	ScreeningKnockoutTree,
	InfoJob,
	JobPortal,
	InterviewWhatsapp,
} from './job'
export type {
	JobApplied,
	CompanyInterview,
	PublicInterview,
	CandidateLike,
	InterviewData,
	InterviewAnswer,
	InterviewInfoItem,
	CaptionSegment,
	InterviewTranslationLanguage,
	InterviewResultTranslation,
	BatchProcessingData,
	WhatsappTriagemResult,
	CandidateEvaluation,
	LanguageEvaluation,
	RejectionDecisionSource,
	RejectionReviewRequest,
	RejectionReviewStatus,
	ApplicationDraft,
	CandidateSource,
} from './candidate'
export { CANDIDATE_SOURCES, DEFAULT_CANDIDATE_SOURCE } from './candidate'
export type {
	ConsentPurpose,
	ConsentRecord,
	DataSubjectOperation,
	DataSubjectRequest,
	RetentionPolicy,
} from './consent'
export {
	CONSENT_PURPOSES,
	DATA_SUBJECT_OPERATIONS,
	DEFAULT_CANDIDATE_RETENTION_DAYS,
	LGPD_RESPONSE_DEADLINE_DAYS,
} from './consent'
export type {
	CandidateFeatures,
	CandidateOutcome,
	FeatureName,
	OutcomeLabel,
} from './candidate-features'
export {
	ALLOWED_FEATURES,
	FORBIDDEN_FEATURES,
	OUTCOME_LABELS,
	isTrainable,
} from './candidate-features'
export type { Occupation, Skill, TaxonomySource } from './occupation'
export {
	TAXONOMY_SOURCES,
	normalizeTerm,
	OCCUPATION_MATCH_THRESHOLD,
} from './occupation'
export type { HiringIntent } from './job'
export { HIRING_INTENTS, DEFAULT_FRESHNESS_SLA_DAYS } from './job'
export type { Collaborator } from './collaborator'
export type { AdminUser, AdminRole } from './admin-user'
export type { AuditLog } from './audit-log'
export type { CompanyNotification, NotificationMessage } from './notification'
export type { ConversationContext } from './conversation'
export type {
	CreditsUsed,
	SubscriptionHistory,
	Nps,
	BillingHistory,
	StripeWebhookHistory,
} from './billing'
export type { GupyIntegration } from './gupy'
export type { ShortLink } from './short-link'
export type { InterviewHandoff } from './interview-handoff'
export type {
	OtsAttestation,
	OtsAttestationTier,
	VerifiedOtsAttestation,
} from './ots-attestation'
export type { HiringManagerReviewToken } from './hm-review-token'
export type {
	SharedCandidateLink,
	SharedCandidateLinkSections,
} from './shared-candidate-link'
export type { Batch } from './batch'
export type { ResultWebhook } from './result-webhook'
export type { WebhookDeliveryLog } from './webhook-delivery-log'
export type { ErrorEvent } from './error-event'
export type { GlobalSettings, SmtpSettings, MotorPluginSettings } from './global-settings'
export type { MotorLicense } from './motor-license'
export type { AiUsageEvent, AiUsageSource, AiUsageSurface } from './ai-usage'
export type {
	InterviewAbandonment,
	InterviewAbandonmentReason,
} from './interview-abandonment'
export { INTERVIEW_ABANDONMENT_REASONS } from './interview-abandonment'
export type {
	AdminCandidateSummary,
	AdminCandidateSummaryInterview,
} from './admin-candidate-summary'
export type {
	EnterpriseContract,
	EnterpriseContractStatus,
} from './enterprise-contract'
export type {
	EnterprisePayment,
	EnterprisePaymentStatus,
	EnterprisePaymentMethod,
} from './enterprise-payment'
export type {
	TalentCreditCatalogItem,
	TalentCreditLedgerEntry,
	TalentCreditLedgerKind,
	TalentCreditReservation,
	TalentCreditReservationStatus,
	TalentCreditWallet,
} from './talent-credits'
