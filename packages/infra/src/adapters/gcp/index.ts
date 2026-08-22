import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import type { InfraProvider } from '../../interfaces'
import { createFirebaseAuthAdapter } from './auth'
import { createGcpPubSubAdapter, type GcpPubSubConfig } from './pubsub'
import { createCloudTasksAdapter, type GcpQueueConfig } from './queue'
import {
	createFirestoreAdminUserRepository,
	createFirestoreAiUsageRepository,
	createFirestoreAuditLogRepository,
	createFirestoreBatchRepository,
	createFirestoreBillingRepository,
	createFirestoreCandidateRepository,
	createFirestoreCollaboratorRepository,
	createFirestoreScorecardRepository,
	createFirestoreCandidateTimelineRepository,
	createFirestoreJobRequisitionRepository,
	createFirestoreOfferRepository,
	createFirestoreOrgRepository,
	createFirestoreLgpdRepository,
	createFirestoreTaxonomyRepository,
	createFirestoreCompanyRepository,
	createFirestoreConversationRepository,
	createFirestoreEnterpriseContractRepository,
	createFirestoreEnterprisePaymentRepository,
	createFirestoreErrorEventRepository,
	createFirestoreGlobalSettingsRepository,
	createFirestoreMotorLicenseRepository,
	createFirestoreGupyIntegrationRepository,
	createFirestoreInterviewAbandonmentRepository,
	createFirestoreJobRepository,
	createFirestoreResultWebhookRepository,
	createFirestoreWebhookDeliveryLogRepository,
	createFirestoreNotificationRepository,
	createFirestoreOutboxRepository,
	createFirestorePessoaRepository,
	createFirestoreRejectionReviewRequestRepository,
	createFirestoreSharedCandidateLinkRepository,
	createFirestoreShortLinkRepository,
	createFirestoreInterviewHandoffRepository,
	createFirestoreOtsAttestationRepository,
	createFirestoreHiringManagerReviewTokenRepository,
	createFirestoreTalentCreditsRepository,
	createFirestoreUserRepository,
} from './repositories'
import { createGcsStorageAdapter } from './storage'

export type GcpConfig = {
	firebase: {
		projectId: string
		clientEmail: string
		privateKey: string
		databaseURL: string
		storageBucket: string
		apiKey: string
	}
	cloudTasks?: GcpQueueConfig
	pubsub?: GcpPubSubConfig
}

export function createGcpProvider(config: GcpConfig): InfraProvider & { raw: ReturnType<typeof initializeFirebase> } {
	const firebase = initializeFirebase(config.firebase)

	const auth = createFirebaseAuthAdapter(firebase.auth, config.firebase.apiKey)
	const storage = createGcsStorageAdapter(firebase.app)

	const queue = config.cloudTasks
		? createCloudTasksAdapter(config.cloudTasks)
		: createNoopQueue()

	const pubsub = config.pubsub
		? createGcpPubSubAdapter(config.pubsub)
		: createNoopPubSub()

	const companyRepository = createFirestoreCompanyRepository(firebase.db)
	const userRepository = createFirestoreUserRepository(firebase.db)
	const pessoaRepository = createFirestorePessoaRepository(firebase.db)
	const outboxRepository = createFirestoreOutboxRepository(firebase.db)
	const jobRepository = createFirestoreJobRepository(firebase.db)
	const candidateRepository = createFirestoreCandidateRepository(firebase.db)
	const collaboratorRepository = createFirestoreCollaboratorRepository(firebase.db)
	const scorecardRepository = createFirestoreScorecardRepository(firebase.db)
	const candidateTimelineRepository = createFirestoreCandidateTimelineRepository(firebase.db)
	const jobRequisitionRepository = createFirestoreJobRequisitionRepository(firebase.db)
	const offerRepository = createFirestoreOfferRepository(firebase.db)
	const orgRepository = createFirestoreOrgRepository(firebase.db)
	const lgpdRepository = createFirestoreLgpdRepository(firebase.db)
	const taxonomyRepository = createFirestoreTaxonomyRepository(firebase.db)
	const notificationRepository = createFirestoreNotificationRepository(firebase.db)
	const billingRepository = createFirestoreBillingRepository(firebase.db)
	const batchRepository = createFirestoreBatchRepository(firebase.db)
	const shortLinkRepository = createFirestoreShortLinkRepository(firebase.db)
	const interviewHandoffRepository = createFirestoreInterviewHandoffRepository(firebase.db)
	const otsAttestationRepository = createFirestoreOtsAttestationRepository(firebase.db)
	const hmReviewTokenRepository = createFirestoreHiringManagerReviewTokenRepository(firebase.db)
	const sharedCandidateLinkRepository = createFirestoreSharedCandidateLinkRepository(firebase.db)
	const conversationRepository = createFirestoreConversationRepository(firebase.db)
	const gupyIntegrationRepository = createFirestoreGupyIntegrationRepository(firebase.db)
	const interviewAbandonmentRepository = createFirestoreInterviewAbandonmentRepository(firebase.db)
	const rejectionReviewRequestRepository = createFirestoreRejectionReviewRequestRepository(firebase.db)
	const resultWebhookRepository = createFirestoreResultWebhookRepository(firebase.db)
	const webhookDeliveryLogRepository = createFirestoreWebhookDeliveryLogRepository(firebase.db)
	const errorEventRepository = createFirestoreErrorEventRepository(firebase.db)
	const globalSettingsRepository = createFirestoreGlobalSettingsRepository(firebase.db)
	const motorLicenseRepository = createFirestoreMotorLicenseRepository(firebase.db)
	const aiUsageRepository = createFirestoreAiUsageRepository(firebase.db)
	const adminUserRepository = createFirestoreAdminUserRepository(firebase.db)
	const auditLogRepository = createFirestoreAuditLogRepository(firebase.db)
	const enterpriseContractRepository = createFirestoreEnterpriseContractRepository(firebase.db)
	const enterprisePaymentRepository = createFirestoreEnterprisePaymentRepository(firebase.db)
	const talentCreditsRepository = createFirestoreTalentCreditsRepository(firebase.db)

	return {
		isFirestore: true,
		auth,
		storage,
		queue,
		pubsub,
		companyRepository,
		userRepository,
		pessoaRepository,
		outboxRepository,
		jobRepository,
		candidateRepository,
		collaboratorRepository,
		scorecardRepository,
		candidateTimelineRepository,
		jobRequisitionRepository,
		offerRepository,
		orgRepository,
		lgpdRepository,
		taxonomyRepository,
		notificationRepository,
		billingRepository,
		batchRepository,
		shortLinkRepository,
		interviewHandoffRepository,
		otsAttestationRepository,
		hmReviewTokenRepository,
		sharedCandidateLinkRepository,
		conversationRepository,
		gupyIntegrationRepository,
		interviewAbandonmentRepository,
		rejectionReviewRequestRepository,
		resultWebhookRepository,
		webhookDeliveryLogRepository,
		errorEventRepository,
		globalSettingsRepository,
		motorLicenseRepository,
		aiUsageRepository,
		adminUserRepository,
		auditLogRepository,
		enterpriseContractRepository,
		enterprisePaymentRepository,
		talentCreditsRepository,
		raw: firebase,
	}
}

function initializeFirebase(config: GcpConfig['firebase']) {
	const app = initializeApp({
		credential: cert({
			projectId: config.projectId,
			clientEmail: config.clientEmail,
			privateKey: config.privateKey.replace(/\\n/g, '\n'),
		}),
		databaseURL: config.databaseURL,
		storageBucket: config.storageBucket,
	})

	const db = getFirestore(app)
	// Permite passar `undefined` em campos opcionais sem que o SDK lance erro.
	// Crítico pra audit log onde metadata pode trazer chaves não preenchidas
	// (ex: body.notes ausente em /admin/companies/:id/actions/set-status).
	db.settings({ ignoreUndefinedProperties: true })
	return {
		app,
		auth: getAuth(app),
		db,
	}
}

function createNoopQueue(): InfraProvider['queue'] {
	const notConfigured = () => {
		throw new Error('[Infra] Queue adapter not configured. Provide cloudTasks config.')
	}

	return {
		ensureQueueExists: notConfigured,
		createTask: notConfigured,
		getQueueInfo: notConfigured,
		getFailedTasks: notConfigured,
	}
}

function createNoopPubSub(): InfraProvider['pubsub'] {
	const notConfigured = () => {
		throw new Error('[Infra] PubSub adapter not configured. Provide pubsub config.')
	}

	return {
		ensureTopicExists: notConfigured,
		publish: notConfigured,
		sendFailedTaskMessage: notConfigured,
	}
}

export { createFirebaseAuthAdapter } from './auth'
export { createGcpPubSubAdapter } from './pubsub'
export type { GcpPubSubConfig } from './pubsub'
export { createCloudTasksAdapter } from './queue'
export type { GcpQueueConfig } from './queue'
export { createGcsStorageAdapter } from './storage'
