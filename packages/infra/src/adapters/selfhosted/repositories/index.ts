import { createSelfHostedScorecardRepository } from './scorecard-repository'
import { createSelfHostedCandidateTimelineRepository } from './candidate-timeline-repository'
import { createSelfHostedJobRequisitionRepository } from './job-requisition-repository'
import { createSelfHostedOfferRepository } from './offer-repository'
import { createSelfHostedOrgRepository } from './org-repository'
import { createSelfHostedLgpdRepository } from './lgpd-repository'
import { createSelfHostedTaxonomyRepository } from './taxonomy-repository'
import type { DrizzleDb } from "../db/client";
import { createDrizzleAiUsageRepository } from "./ai-usage-repository";
import { createDrizzleBatchRepository } from "./batch-repository";
import { createDrizzleBillingRepository } from "./billing-repository";
import { createDrizzleNpsRepository } from "./nps-repository";
import { createDrizzleCandidateRepository } from "./candidate-repository";
import { createDrizzleCollaboratorRepository } from "./collaborator-repository";
import { createDrizzleCompanyRepository } from "./company-repository";
import { createDrizzleConversationRepository } from "./conversation-repository";
import { createDrizzleErrorEventRepository } from "./error-event-repository";
import { createDrizzleGlobalSettingsRepository } from "./global-settings-repository";
import { createDrizzleInterviewAbandonmentRepository } from "./interview-abandonment-repository";
import { createDrizzleInterviewHandoffRepository } from "./interview-handoff-repository";
import { createDrizzleOtsAttestationRepository } from "./ots-attestation-repository";
import { createDrizzleHiringManagerReviewTokenRepository } from "./hm-review-token-repository";
import { createDrizzleRejectionReviewRequestRepository } from "./rejection-review-request-repository";
import { createDrizzleResultWebhookRepository } from "./result-webhook-repository";
import { createDrizzleWebhookDeliveryLogRepository } from "./webhook-delivery-log-repository";
import { createDrizzleJobRepository } from "./job-repository";
import { createDrizzleNotificationRepository } from "./notification-repository";
import { createDrizzleOutboxRepository } from "./outbox-repository";
import { createDrizzlePessoaRepository } from "./pessoa-repository";
import { createDrizzleSharedCandidateLinkRepository } from "./shared-candidate-link-repository";
import { createDrizzleShortLinkRepository } from "./short-link-repository";
import { createDrizzleUserRepository } from "./user-repository";

export function createDrizzleRepositories(db: DrizzleDb) {
	return {
		companyRepository: createDrizzleCompanyRepository(db),
		userRepository: createDrizzleUserRepository(db),
		pessoaRepository: createDrizzlePessoaRepository(db),
		outboxRepository: createDrizzleOutboxRepository(db),
		jobRepository: createDrizzleJobRepository(db),
		candidateRepository: createDrizzleCandidateRepository(db),
		collaboratorRepository: createDrizzleCollaboratorRepository(db),
		scorecardRepository: createSelfHostedScorecardRepository(db),
		candidateTimelineRepository: createSelfHostedCandidateTimelineRepository(db),
		jobRequisitionRepository: createSelfHostedJobRequisitionRepository(db),
		offerRepository: createSelfHostedOfferRepository(db),
		orgRepository: createSelfHostedOrgRepository(db),
		lgpdRepository: createSelfHostedLgpdRepository(db),
		taxonomyRepository: createSelfHostedTaxonomyRepository(db),
		notificationRepository: createDrizzleNotificationRepository(db),
		billingRepository: createDrizzleBillingRepository(db),
		npsRepository: createDrizzleNpsRepository(db),
		batchRepository: createDrizzleBatchRepository(db),
		shortLinkRepository: createDrizzleShortLinkRepository(db),
		interviewHandoffRepository: createDrizzleInterviewHandoffRepository(db),
		otsAttestationRepository: createDrizzleOtsAttestationRepository(db),
		hmReviewTokenRepository: createDrizzleHiringManagerReviewTokenRepository(db),
		sharedCandidateLinkRepository: createDrizzleSharedCandidateLinkRepository(db),
		conversationRepository: createDrizzleConversationRepository(db),
		interviewAbandonmentRepository: createDrizzleInterviewAbandonmentRepository(db),
		rejectionReviewRequestRepository: createDrizzleRejectionReviewRequestRepository(db),
		resultWebhookRepository: createDrizzleResultWebhookRepository(db),
		webhookDeliveryLogRepository: createDrizzleWebhookDeliveryLogRepository(db),
		errorEventRepository: createDrizzleErrorEventRepository(db),
		globalSettingsRepository: createDrizzleGlobalSettingsRepository(db),
		aiUsageRepository: createDrizzleAiUsageRepository(db),
	};
}
