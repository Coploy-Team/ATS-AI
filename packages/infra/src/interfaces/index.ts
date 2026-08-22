import type { AuthAdapter } from './auth'
import type { StorageAdapter } from './storage'
import type { QueueAdapter } from './queue'
import type { PubSubAdapter } from './pubsub'
import type {
	AdminUserRepository,
	AiUsageRepository,
	AuditLogRepository,
	BatchRepository,
	BillingRepository,
	CandidateRepository,
	CollaboratorRepository,
	ScorecardRepository,
	CandidateTimelineRepository,
	JobRequisitionRepository,
	OfferRepository,
	OrgRepository,
	LgpdRepository,
	TaxonomyRepository,
	CompanyRepository,
	ConversationRepository,
	EnterpriseContractRepository,
	EnterprisePaymentRepository,
	ErrorEventRepository,
	GlobalSettingsRepository,
	MotorLicenseRepository,
	GupyIntegrationRepository,
	HiringManagerReviewTokenRepository,
	InterviewAbandonmentRepository,
	JobRepository,
	NotificationRepository,
	OutboxRepository,
	PessoaRepository,
	RejectionReviewRequestRepository,
	ResultWebhookRepository,
	SharedCandidateLinkRepository,
	ShortLinkRepository,
	InterviewHandoffRepository,
	OtsAttestationRepository,
	TalentCreditsRepository,
	UserRepository,
	WebhookDeliveryLogRepository,
} from './repositories'

export type InfraProvider = {
	isFirestore: boolean
	auth: AuthAdapter
	storage: StorageAdapter
	queue: QueueAdapter
	pubsub: PubSubAdapter
	companyRepository: CompanyRepository
	userRepository: UserRepository
	pessoaRepository: PessoaRepository
	outboxRepository: OutboxRepository
	jobRepository: JobRepository
	candidateRepository: CandidateRepository
	collaboratorRepository: CollaboratorRepository
	scorecardRepository: ScorecardRepository
	candidateTimelineRepository: CandidateTimelineRepository
	jobRequisitionRepository: JobRequisitionRepository
	offerRepository: OfferRepository
	orgRepository: OrgRepository
	lgpdRepository: LgpdRepository
	taxonomyRepository: TaxonomyRepository
	notificationRepository: NotificationRepository
	billingRepository: BillingRepository
	batchRepository: BatchRepository
	shortLinkRepository: ShortLinkRepository
	interviewHandoffRepository: InterviewHandoffRepository
	otsAttestationRepository: OtsAttestationRepository
	hmReviewTokenRepository: HiringManagerReviewTokenRepository
	sharedCandidateLinkRepository: SharedCandidateLinkRepository
	conversationRepository: ConversationRepository
	gupyIntegrationRepository: GupyIntegrationRepository
	interviewAbandonmentRepository: InterviewAbandonmentRepository
	rejectionReviewRequestRepository: RejectionReviewRequestRepository
	resultWebhookRepository: ResultWebhookRepository
	webhookDeliveryLogRepository: WebhookDeliveryLogRepository
	errorEventRepository: ErrorEventRepository
	globalSettingsRepository: GlobalSettingsRepository
	motorLicenseRepository: MotorLicenseRepository
	aiUsageRepository: AiUsageRepository
	adminUserRepository: AdminUserRepository
	auditLogRepository: AuditLogRepository
	enterpriseContractRepository: EnterpriseContractRepository
	enterprisePaymentRepository: EnterprisePaymentRepository
	talentCreditsRepository: TalentCreditsRepository
}

export type { QueryFilter, ListOptions, ComparisonOperator } from '@coploy/domain'
export type {
	AdminCandidateSummary,
	AdminCandidateSummaryInterview,
} from '@coploy/domain'
export type {
	AdminUserRepository,
	AiUsageRepository,
	AuditLogRepository,
	BatchRepository,
	BillingRepository,
	CandidateRepository,
	CollaboratorRepository,
	CompanyRepository,
	ConversationRepository,
	GupyIntegrationRepository,
	JobRepository,
	NotificationRepository,
	OutboxRepository,
	PessoaRepository,
	RejectionReviewRequestRepository,
	ResultWebhookRepository,
	SharedCandidateLinkRepository,
	ShortLinkRepository,
	InterviewHandoffRepository,
	OtsAttestationRepository,
	HiringManagerReviewTokenRepository,
	TalentCreditsRepository,
	UserRepository,
	WebhookDeliveryLogRepository,
	ErrorEventRepository,
	GlobalSettingsRepository,
	MotorLicenseRepository,
} from './repositories'
export type { AuthAdapter, DecodedToken, CreateUserParams, UserRecord } from './auth'
export type { StorageAdapter } from './storage'
export type { QueueAdapter, CreateTaskOptions } from './queue'
export type { PubSubAdapter } from './pubsub'
