import type { AuthAdapter } from './auth'
import type { StorageAdapter } from './storage'
import type { QueueAdapter } from './queue'
import type { PubSubAdapter } from './pubsub'
import type {
	AiUsageRepository,
	BatchRepository,
	BillingRepository,
	NpsRepository,
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
	ErrorEventRepository,
	GlobalSettingsRepository,
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
	npsRepository: NpsRepository
	batchRepository: BatchRepository
	shortLinkRepository: ShortLinkRepository
	interviewHandoffRepository: InterviewHandoffRepository
	otsAttestationRepository: OtsAttestationRepository
	hmReviewTokenRepository: HiringManagerReviewTokenRepository
	sharedCandidateLinkRepository: SharedCandidateLinkRepository
	conversationRepository: ConversationRepository
	interviewAbandonmentRepository: InterviewAbandonmentRepository
	rejectionReviewRequestRepository: RejectionReviewRequestRepository
	resultWebhookRepository: ResultWebhookRepository
	webhookDeliveryLogRepository: WebhookDeliveryLogRepository
	errorEventRepository: ErrorEventRepository
	globalSettingsRepository: GlobalSettingsRepository
	/**
	 * Medidor de custo de IA por empresa.
	 *
	 * OPCIONAL desde 2026-08-29: medir consumo é necessidade de quem OPERA um
	 * serviço com muitas empresas e precisa saber quanto cada uma custa. Uma
	 * instalação que roda para si mesma não tem esse problema — e obrigá-la a
	 * carregar o medidor só para satisfazer um tipo era o motivo de a telemetria
	 * atravessar código que não deveria conhecê-la.
	 */
	aiUsageRepository?: AiUsageRepository
}

export type { QueryFilter, ListOptions, ComparisonOperator } from '@coploy/domain'
export type {
	AdminCandidateSummary,
	AdminCandidateSummaryInterview,
} from '@coploy/domain'
export type {
	AiUsageRepository,
	BatchRepository,
	BillingRepository,
	CandidateRepository,
	CollaboratorRepository,
	CompanyRepository,
	ConversationRepository,
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
	UserRepository,
	WebhookDeliveryLogRepository,
	ErrorEventRepository,
	GlobalSettingsRepository,
} from './repositories'
export type { AuthAdapter, DecodedToken, CreateUserParams, UserRecord } from './auth'
export type { StorageAdapter } from './storage'
export type { QueueAdapter, CreateTaskOptions } from './queue'
export type { PubSubAdapter } from './pubsub'
