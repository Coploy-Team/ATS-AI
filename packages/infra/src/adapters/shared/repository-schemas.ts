import { z } from 'zod'

const optionalDate = z.preprocess((value) => {
	if (value === null || value === undefined || value === '') return undefined
	if (value instanceof Date) return value
	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? undefined : parsed
	}
	return value
}, z.date().nullable().optional())
const optionalString = z.union([z.string(), z.null(), z.undefined()])
const optionalBoolean = z.union([z.boolean(), z.null(), z.undefined()])
const optionalNumber = z.preprocess((value) => {
	if (value === null || value === undefined || value === '') return value
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value)
		return Number.isFinite(parsed) ? parsed : value
	}
	return value
}, z.number().nullable().optional())
const isoDateString = z.preprocess((value) => {
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'number') {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
	}
	if (typeof value === 'string') {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
	}
	return value
}, z.string())
const optionalNumberish = z.union([z.number(), z.string(), z.null(), z.undefined()])
const optionalStringArray = z.array(z.string()).nullable().optional()
const optionalRecord = z.record(z.string(), z.unknown())
const optionalNestedEntityRef = z.preprocess((value) => {
	if (value === null || value === undefined) return value
	// String vazia no Firestore (legado) → trata como ausente, não como objeto inválido
	if (value === '') return undefined
	if (typeof value === 'string') return { id: value }
	if (typeof value === 'object') {
		const ref = value as Record<string, unknown>
		if (typeof ref.id === 'string') {
			if (typeof ref.path === 'string') return { id: ref.id, path: ref.path }
			return { id: ref.id }
		}
		if (typeof ref.path === 'string') {
			const parts = ref.path.split('/').filter(Boolean)
			const id = parts.at(-1)
			if (id) return { id, path: ref.path }
		}
	}
	return value
}, z.object({
	id: z.string(),
	path: z.string().optional(),
}).nullable().optional())
const optionalQuestion = z.object({
	id: optionalString,
	question: optionalString,
	audioUrl: optionalString,
	level: optionalString,
	peso: optionalNumber,
	skills: optionalString,
	finish: optionalBoolean,
}).passthrough()
const structuredRequirementSchema = z.object({
	id: z.string(),
	label: z.string(),
	skill: optionalString,
	weight: z.number(),
	required: z.boolean(),
}).passthrough()
const screeningKnockoutTreeSchema = z.object({
	version: z.number(),
	nodes: z.array(z.object({
		id: z.string(),
		question: z.string(),
		type: z.enum(['boolean', 'single-choice', 'number']),
		options: z.array(z.string()).nullable().optional(),
		rule: z.object({
			operator: z.enum([
				'equals',
				'not_equals',
				'greater_than',
				'greater_than_or_equal',
				'less_than',
				'less_than_or_equal',
				'in',
				'not_in',
			]),
			value: z.union([
				z.string(),
				z.number(),
				z.boolean(),
				z.array(z.string()),
				z.array(z.number()),
				z.array(z.boolean()),
				z.null(),
			]),
		}).passthrough(),
		onFail: z.enum(['knockout', 'flag']),
		weight: z.number().nullable().optional(),
	}).passthrough()),
}).passthrough()

export const UserRepositorySchema = z.object({
	id: z.string(),
	uuid: optionalString,
	display_name: optionalString,
	first_name: optionalString,
	last_name: optionalString,
	email: optionalString,
	phone_number: optionalString,
	photo_url: optionalString,
	is_owner: optionalBoolean,
	language: optionalString,
	countryOfResidence: optionalString,
	countriesOfInterest: optionalStringArray,
	professionalObjectives: optionalString,
	resumeUrl: optionalString,
	occupation: optionalString,
	level: optionalString,
	state: optionalString,
	city: optionalString,
	external_id: optionalString,
	professional_experience: optionalString,
	professionalExperience: optionalString,
	academic: optionalString,
	finished: optionalBoolean,
	pdf_socioEmotional: optionalString,
	testing: optionalBoolean,
	paymentDetails: z.object({
		stripeCustomerId: optionalString,
		paied: optionalBoolean,
		paidDate: optionalDate,
		messageError: optionalString,
		dateError: optionalDate,
	}).passthrough().nullable().optional(),
	dreamJobsInterview: z.object({
		jobId: optionalString,
		jobAppliedId: optionalString,
		createdAt: optionalDate,
		status: optionalString,
		completedAt: optionalDate,
		generalFeedback: optionalString,
	}).passthrough().nullable().optional(),
}).passthrough()

export const UsersCompanyRepositorySchema = z.object({
	id: z.string(),
	uuid: optionalString,
	company: optionalNestedEntityRef,
	display_name: optionalString,
	email: optionalString,
	first_name: optionalString,
	last_name: optionalString,
	occupation: optionalString,
	phone_number: optionalString,
	photo_url: optionalString,
	is_owner: optionalBoolean,
	access_level: optionalString,
	created_time: optionalDate,
}).passthrough()

export const CompanyRepositorySchema = z.object({
	id: z.string(),
	companyName: optionalString,
	companyBio: optionalString,
	companLogo: optionalString,
	companyCity: optionalString,
	companyCountry: optionalString,
	companyState: optionalString,
	companySize: optionalString,
	companyWebsite: optionalString,
	companyId: optionalString,
	segment: optionalString,
	ownerCompany: optionalNestedEntityRef,
	ownerUserCompanyId: optionalString,
	subscriptionPlan: optionalString,
	subscriptionStatus: optionalString,
	subscriptionId: optionalString,
	stripeCustomerId: optionalString,
	currentPeriodEnd: optionalNumber,
	trialEnd: optionalNumber,
	objective: z.array(z.string()).nullable().optional(),
	typeInterview: z.array(z.string()).nullable().optional(),
	headquartersCountries: z.array(z.string()).nullable().optional(),
	notificationsEmail: optionalBoolean,
	notificationReportWeek: optionalBoolean,
	evaluateInternationalCandidates: optionalBoolean,
	whatsappBetaAccess: optionalBoolean,
	retro2025: optionalString,
	featureFlags: z
		.object({
			antiGhosting: optionalBoolean,
			applyLite: optionalBoolean,
		})
		.passthrough()
		.nullable()
		.optional(),
	featureUseEngineProcessing: optionalBoolean,
	creditsMonthly: optionalNumber,
	creditsCourtesy: optionalNumber,
	creditsFixed: optionalNumber,
	trialCourtesyCreditsGranted: optionalNumber,
	jobPortal: optionalNestedEntityRef,
	subscriptionCredits: z.object({
		creditsMonthly: optionalNumber,
		creditsCourtesy: optionalNumber,
		creditsFixed: optionalNumber,
		creditsTotal: optionalNumber,
	}).passthrough().nullable().optional(),
	subscriptionDetails: z.object({
		stripeCustomerId: optionalString,
		plan: optionalString,
		status: optionalString,
		startAt: optionalDate,
		endAt: optionalDate,
	}).passthrough().nullable().optional(),
	subscriptionTrial: z.object({
		courtesyCreditsGranted: optionalNumber,
		grantedAt: optionalDate,
		startAt: optionalDate,
	}).passthrough().nullable().optional(),
	features: z.object({
		useEngineProcessing: optionalBoolean,
	}).passthrough().nullable().optional(),
}).passthrough()

export const PostJobRepositorySchema = z.object({
	id: z.string(),
	jobId: optionalString,
	jobName: optionalString,
	identifier: optionalString,
	jobDescription: optionalString,
	employmentType: optionalString,
	carrerLevel: optionalString,
	language: optionalString,
	typeInterview: optionalString,
	interviewMode: z.enum(['video', 'voice', 'whatsapp']).nullish(),
	evaluateLanguage: optionalBoolean,
	profileInterview: optionalBoolean,
	antiGhostingEnabled: optionalBoolean,
	feedbackSlaHours: optionalNumber,
	slaIrregularSince: optionalDate,
	slaAlertSentAt: optionalDate,
	slaAutoStoppedAt: optionalDate,
	slaAutoStoppedByAntiGhosting: optionalBoolean,
	slaPublicBeforeAutoStop: optionalBoolean,
	jobResponsabilities: optionalString,
	jobResponsibilities: optionalString,
	jobRequirements: optionalString,
	structuredRequirements: z.array(structuredRequirementSchema).nullable().optional(),
	knockoutTree: screeningKnockoutTreeSchema.nullable().optional(),
	jobCategories: optionalString,
	jobModel: optionalString,
	jobHours: optionalString,
	companyName: optionalString,
	creatorId: optionalString,
	/** Ausente = envia o retorno automático ao candidato. */
	sendCandidateFeedback: optionalBoolean,
	creatorName: optionalString,
	creatorEmail: optionalString,
	contractType: optionalString,
	screeningObjective: optionalString,
	workModality: optionalString,
	mainSkills: optionalString,
	generatedJobDescription: optionalString,
	limitNumberJobVacancies: optionalString,
	stopped: optionalBoolean,
	archived: optionalBoolean,
	public: optionalBoolean,
	priority: optionalBoolean,
	limitedJobVacancy: optionalBoolean,
	infoJobsBool: optionalBoolean,
	requiresPreviousExperience: optionalBoolean,
	minimumAge: optionalNumber,
	timeCreated: optionalDate,
	closingDate: optionalDate,
	educationalRequiements: z.array(z.string()).nullable().optional(),
	address: z.object({
		state: optionalString,
		country: optionalString,
		city: optionalString,
	}).passthrough().nullable().optional(),
	jobDescriptionMetadata: z.object({
		companyDescription: optionalString,
		contractType: optionalString,
		benefits: optionalString,
		salary: optionalString,
		generatedAt: optionalDate,
		generatedBy: optionalString,
	}).passthrough().nullable().optional(),
	uid: optionalNestedEntityRef,
	infoJobs: optionalNestedEntityRef,
	uid_notification_message: optionalNestedEntityRef,
	usersApplied: z.array(optionalNestedEntityRef).nullable().optional(),
	jobQuestions: z.array(optionalQuestion).nullable().optional(),
	additionalQuestions: z.array(optionalQuestion).nullable().optional(),
	evaluation: optionalRecord.nullable().optional(),
	competencias_criticas: optionalString,
	competencias_adicionais: optionalString,
	expectativas: optionalString,
}).passthrough()

export const InfoJobRepositorySchema = z.object({
	id: z.string(),
	name: optionalString,
	finishText: optionalString,
	finishVideo: optionalString,
	welcomeText: optionalString,
	welcomeVideo: optionalString,
}).passthrough()

export const InsightsCacheRepositorySchema = z.object({
	id: z.string(),
	company_id: optionalString,
	companyId: optionalString,
	language: optionalString,
	insight: optionalString,
	generatedAt: optionalDate,
	sampleSizeInterviews: optionalNumber,
	sampleSizeJobs: optionalNumber,
}).passthrough()

export const BatchRepositorySchema = z.object({
	id: z.string(),
	type: optionalString,
	status: optionalString,
	interviewId: optionalString,
	userId: optionalString,
	companyId: optionalString,
	jobAppliedPath: optionalString,
	engineBatchId: optionalString,
	openaiBatchId: optionalString,
	openaiFileId: optionalString,
	openaiOutputFileId: optionalString,
	totalItems: optionalNumber,
	processedItems: optionalNumber,
	totalTokensUsed: optionalNumber,
	promptTokensUsed: optionalNumber,
	completionTokensUsed: optionalNumber,
	processingMode: optionalString,
	requestedBy: optionalString,
	error: optionalString,
	completedAt: optionalDate,
	createdAt: optionalDate,
	updatedAt: optionalDate,
}).passthrough()

export const CreditsUsedRepositorySchema = z.object({
	id: z.string(),
	companyOwner: optionalString,
	debitedFrom: optionalString,
	feature: optionalString,
	ip: optionalString,
	jobApplied: optionalString,
	postJobId: optionalString,
	userId: optionalString,
	source: optionalString,
	usedAt: optionalDate,
	usedBy: optionalString,
	usedByName: optionalString,
	userAgent: optionalString,
	jobName: optionalString,
	candidateName: optionalString,
	score: optionalNumberish,
	isHunting: optionalBoolean,
}).passthrough()

export const SubscriptionHistoryRepositorySchema = z.object({
	id: z.string(),
	action: optionalString,
	operationId: optionalString,
	mode: optionalString,
	customerId: optionalString,
	status: optionalString,
	plan: optionalString,
	timestamp: optionalNumber,
	details: optionalRecord.nullable().optional(),
	eventId: optionalString,
	createdAt: optionalNumber,
	subscriptionId: optionalString,
}).passthrough()

export const NpsRepositorySchema = z.object({
	id: z.string(),
	companyId: optionalString,
	jobId: optionalString,
	jobName: optionalString,
	candidateId: optionalString,
	candidateName: optionalString,
	candidateEmail: optionalString,
	jobApplied: optionalString,
	photo_url: optionalString,
	score: optionalNumber,
	comment: optionalString,
	interviewType: optionalString,
	createdAt: optionalDate,
	updatedAt: optionalDate,
	company: optionalNestedEntityRef,
	job: optionalNestedEntityRef,
	candidate: optionalNestedEntityRef,
}).passthrough()

export const InterviewAbandonmentRepositorySchema = z.object({
	id: z.string(),
	interviewId: z.string(),
	jobId: z.string(),
	companyId: z.string(),
	userId: optionalString,
	reason: z.enum([
		'technical_issue',
		'changed_mind',
		'too_long',
		'will_finish_later',
		'privacy_concern',
		'other',
	]),
	comment: optionalString,
	questionIndex: optionalNumber,
	createdAt: isoDateString,
}).passthrough()

export const RejectionReviewRequestRepositorySchema = z.object({
	id: z.string(),
	companyId: z.string(),
	jobId: z.string(),
	jobAppliedId: z.string(),
	candidateUserId: z.string(),
	status: z.enum(['pending', 'upheld', 'overturned']),
	requestedAt: z.preprocess((value) => {
		if (value instanceof Date) return value
		if (typeof value === 'string' || typeof value === 'number') {
			const parsed = new Date(value)
			return Number.isNaN(parsed.getTime()) ? value : parsed
		}
		return value
	}, z.date()),
	candidateMessage: optionalString,
	reviewedByUserId: optionalString,
	reviewedAt: optionalDate,
	reviewerNote: optionalString,
	outcomeMessage: optionalString,
}).passthrough()

export const BillingHistoryRepositorySchema = z.object({
	id: z.string(),
	companyId: optionalString,
	action: optionalString,
	type: optionalString,
	timestamp: optionalNumber,
	details: optionalRecord.nullable().optional(),
	data: optionalRecord.nullable().optional(),
}).passthrough()

export const StripeWebhookHistoryRepositorySchema = z.object({
	id: z.string(),
	eventId: optionalString,
	eventType: optionalString,
	event: optionalString,
	processedAt: optionalNumber,
	success: optionalBoolean,
	error: optionalString,
}).passthrough()

export const JobAppliedRepositorySchema = z.object({
	id: z.string(),
	finished: optionalBoolean,
	candidateStatus: optionalString,
	isPracticing: optionalBoolean,
	typeInterview: optionalString,
	appliedTime: optionalDate,
	finishedTime: optionalDate,
	/** Reivindicação atômica do pipeline de finish — ver JobApplied no domain. */
	finishStartedAt: optionalDate,
	dateSelect: optionalDate,
	rejectionReasonCode: optionalString,
	rejectionReasonLabel: optionalString,
	rejectionNote: optionalString,
	rejectionFeedbackSentAt: optionalDate,
	rejectionDecisionSource: z.enum(['manual', 'bulk', 'knockout']).nullable().optional(),
	rejectionDecidedByUserId: optionalString,
	rejectionTaxonomyVersion: optionalString,
	rejectionEvidence: optionalString,
	rejectionRiskFlags: z.array(z.string()).nullable().optional(),
	ackSentAt: optionalDate,
	screeningKnockoutAnswers: optionalRecord.nullable().optional(),
	screeningKnockoutResult: z.object({
		treeVersion: z.number().nullable().optional(),
		passed: z.boolean(),
		score: z.number(),
		failedNodeIds: z.array(z.string()),
		rejectionReasonCode: optionalString,
		evaluatedAt: optionalDate,
	}).passthrough().nullable().optional(),
	screeningKnockoutTreeSnapshot: screeningKnockoutTreeSchema.nullable().optional(),
	companyOwner: optionalNestedEntityRef,
	jobApplied: optionalNestedEntityRef,
	score: optionalNumberish,
	scom: optionalNumber,
	sres: optionalNumber,
	stec: optionalNumber,
	job: optionalString,
	leveljob: optionalString,
	recomentation: optionalString,
	state: z.union([z.boolean(), z.string()]).nullable().optional(),
	nivel_confianca: optionalNumber,
	profundidade: optionalNumber,
	requisitos_atendidos: optionalNumber,
	interview: z.record(z.string(), z.unknown()).nullable().optional(),
	additional: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
	whatsappTriagemResult: z.record(z.string(), z.unknown()).nullable().optional(),
	exitJobResult: z.record(z.string(), z.unknown()).nullable().optional(),
	avaliacaoFinal: z.record(z.string(), z.unknown()).nullable().optional(),
	batchProcessing: z.record(z.string(), z.unknown()).nullable().optional(),
	// Bloco final da avaliação de proficiência de idioma (só quando
	// PostJob.evaluateLanguage = true). Espelha LanguageEvaluation do domain.
	languageEvaluation: z.object({
		score: optionalNumberish,
		nivel: optionalString,
		feedback: optionalString,
		analise: optionalString,
	}).passthrough().nullable().optional(),
	candidateName: optionalString,
	jobName: optionalString,
	jobDescription: optionalString,
	jobLevel: optionalString,
	jobResponsibilities: optionalString,
	jobRequirements: optionalString,
	evaluationLanguage: optionalString,
	language: optionalString,
	engineBatchId: optionalString,
	engineBatchStatus: optionalString,
	// Legado: alguns docs de produção têm `likes` como número (contador antigo)
	// antes de o campo virar array de objetos. Coage qualquer valor não-array
	// para undefined no boundary, evitando 500 no mapDoc/getJobInterview.
	likes: z.preprocess(
		(v) => (Array.isArray(v) ? v : undefined),
		z.array(z.record(z.string(), z.unknown())).nullable().optional(),
	),
}).passthrough()

export const CandidateLikeRepositorySchema = z.object({
	id: z.string(),
	user_id: optionalString,
	name: optionalString,
	avatar_url: optionalString,
	email: optionalString,
	action: optionalBoolean,
	created_at: optionalDate,
}).passthrough()

// Firestore documents in companies/{companyId}/companyInterviews are written
// by the sync-jobs-applied Cloud Function using snake_case keys
// (job_name, job_description, type_interview, career_level, candidate_status,
// date_select), but the rest of the codebase reads them as camelCase. This
// preprocess maps snake → camel before validation, so dashboard/insights
// endpoints actually see jobName/etc instead of undefined.
export const CompanyInterviewRepositorySchema = z.preprocess((raw) => {
	if (!raw || typeof raw !== 'object') return raw
	const r = raw as Record<string, unknown>
	return {
		...r,
		jobName: r.jobName ?? r.job_name,
		jobDescription: r.jobDescription ?? r.job_description,
		typeInterview: r.typeInterview ?? r.type_interview,
		carrerLevel: r.carrerLevel ?? r.career_level,
	candidateStatus: r.candidate_status ?? r.candidateStatus,
	dateSelect: r.date_select ?? r.dateSelect,
	rejectionReasonCode: r.rejectionReasonCode,
	rejectionReasonLabel: r.rejectionReasonLabel,
	rejectionNote: r.rejectionNote,
	rejectionFeedbackSentAt: r.rejectionFeedbackSentAt,
	rejectionDecisionSource: r.rejectionDecisionSource,
	rejectionDecidedByUserId: r.rejectionDecidedByUserId,
	rejectionTaxonomyVersion: r.rejectionTaxonomyVersion,
	rejectionEvidence: r.rejectionEvidence,
	rejectionRiskFlags: r.rejectionRiskFlags,
	ackSentAt: r.ackSentAt,
	}
}, z.object({
	id: z.string(),
	company_id: optionalString,
	post_job_id: optionalString,
	user_id: optionalString,
	finished: optionalBoolean,
	finish: optionalBoolean,
	candidateStatus: optionalString,
	date: optionalDate,
	dateSelect: optionalDate,
	rejectionReasonCode: optionalString,
	rejectionReasonLabel: optionalString,
	rejectionNote: optionalString,
	rejectionFeedbackSentAt: optionalDate,
	rejectionDecisionSource: z.enum(['manual', 'bulk', 'knockout']).nullable().optional(),
	rejectionDecidedByUserId: optionalString,
	rejectionTaxonomyVersion: optionalString,
	rejectionEvidence: optionalString,
	rejectionRiskFlags: z.array(z.string()).nullable().optional(),
	ackSentAt: optionalDate,
	score: optionalNumberish,
	name: optionalString,
	photo_url: optionalString,
	occupation: optionalString,
	external_id: optionalString,
	professionalExperience: optionalString,
	phone_number: optionalString,
	state: optionalString,
	city: optionalString,
	email: optionalString,
	carrerLevel: optionalString,
	jobName: optionalString,
	jobDescription: optionalString,
	typeInterview: optionalString,
	stopped: optionalBoolean,
	job_applied_ref: optionalNestedEntityRef,
	user_ref: optionalNestedEntityRef,
	job_ref: optionalNestedEntityRef,
}).passthrough())

export const PublicInterviewRepositorySchema = z.object({
	id: z.string(),
	company_id: optionalString,
	date: optionalDate,
	email: optionalString,
	external_id: optionalString,
	jobName: optionalString,
	job_name: optionalString,
	name: optionalString,
	occupation: optionalString,
	phone_number: optionalString,
	photo_url: optionalString,
	professionalExperience: optionalString,
	professional_experience: optionalString,
	score: optionalNumberish,
	score_value: optionalNumberish,
	state: optionalString,
	city: optionalString,
	carrerLevel: optionalString,
	career_level: optionalString,
	typeInterview: optionalString,
	type_interview: optionalString,
	academic: optionalString,
	job_applied_ref: optionalNestedEntityRef,
	job_ref: optionalNestedEntityRef,
	user_ref: optionalNestedEntityRef,
	interview_tags: optionalRecord.nullable().optional(),
}).passthrough()

export const CollaboratorRepositorySchema = z.object({
	id: z.string(),
	company_id: optionalString,
	user_company_id: optionalString,
	name: optionalString,
	email: optionalString,
	accessLevel: optionalString,
	/** Ausente = recebe o aviso de entrevista finalizada. */
	notifyOnInterviewFinish: optionalBoolean,
	status: optionalBoolean,
	creationDate: optionalDate,
	userRef: optionalNestedEntityRef,
}).passthrough()

export const ConversationContextRepositorySchema = z.object({
	id: z.string(),
	phone: optionalString,
	currentQuestionId: optionalString,
	step: optionalString,
	interviewId: optionalString,
	companyId: optionalString,
	jobId: optionalString,
	lastMessage: optionalString,
	status: optionalString,
	retryCount: optionalNumber,
	maxRetries: optionalNumber,
	email: optionalString,
	password: optionalString,
	createdAt: optionalDate,
	updatedAt: optionalDate,
}).passthrough()

export const GupyIntegrationRepositorySchema = z.object({
	id: z.string(),
	companyId: optionalString,
	gupyApiToken: optionalString,
	companyName: optionalString,
	emailHtmlTemplate: optionalString,
	interviewBaseUrl: optionalString,
	stepName: optionalString,
	sentTagName: optionalString,
	sentTagColor: optionalString,
	scoreTagPrefix: optionalString,
	scoreTagColor: optionalString,
	techTestFieldLabel: optionalString,
	techTestFieldValue: optionalString,
	careerLevelFieldLabel: optionalString,
	defaultCareerLevel: optionalString,
	defaultLanguage: optionalString,
	questionCount: optionalNumber,
	sendCommentOnFinish: optionalBoolean,
	commentTemplate: optionalString,
	sendCandidateEmail: optionalBoolean,
	syncLookbackDays: optionalNumber,
	autoSyncOnFinish: optionalBoolean,
	enabled: optionalBoolean,
}).passthrough()

export const CompanyNotificationRepositorySchema = z.object({
	id: z.string(),
	title: optionalString,
	message: optionalString,
	status: optionalBoolean,
	read: optionalBoolean,
	dateTime: optionalDate,
	type: optionalString,
	actionRef: optionalString,
	postId: optionalString,
	jobId: optionalString,
	image: optionalString,
}).passthrough()

export const NotificationMessageRepositorySchema = z.object({
	id: z.string(),
	name: optionalString,
	message: optionalString,
	creator: optionalString,
	created_at: optionalDate,
}).passthrough()

export const ShortLinkRepositorySchema = z.object({
	id: z.string(),
	code: optionalString,
	originalUrl: optionalString,
	jobId: optionalString,
	companyId: optionalString,
	createdAt: optionalDate,
	clickCount: optionalNumber,
	lastClickedAt: optionalDate,
	utmSource: optionalString,
	utmMedium: optionalString,
	utmCampaign: optionalString,
	utmContent: optionalString,
}).passthrough()

export const SharedCandidateLinkRepositorySchema = z.object({
	id: z.string(),
	code: z.string(),
	companyId: z.string(),
	jobId: z.string(),
	candidateIds: z.array(z.string()).default([]),
	sections: z.object({
		score: z.boolean(),
		feedback: z.boolean(),
		analysis: z.boolean(),
		questions: z.boolean(),
	}),
	createdBy: optionalString,
	createdAt: optionalDate,
	expiresAt: optionalDate,
	revoked: optionalBoolean,
}).passthrough()

export const ResultWebhookRepositorySchema = z.object({
	id: z.string(),
	companyId: z.string(),
	name: z.string(),
	url: z.string(),
	method: z.enum(['POST', 'PATCH', 'PUT']).default('POST'),
	headers: z.record(z.string(), z.string()).nullable().optional(),
	events: z.array(z.string()).nullable().optional(),
	approvalThreshold: optionalNumber,
	onlyOnApproval: optionalBoolean,
	enabled: optionalBoolean,
	createdAt: optionalDate,
	updatedAt: optionalDate,
}).passthrough()

export const WebhookDeliveryLogRepositorySchema = z.object({
	id: z.string(),
	webhookId: z.string(),
	companyId: z.string(),
	event: z.string(),
	url: z.string(),
	method: z.string(),
	requestHeaders: z.record(z.string(), z.string()).nullable().optional(),
	requestBody: z.record(z.string(), z.unknown()).nullable().optional(),
	statusCode: z.number().nullable().optional(),
	responseBody: z.string().nullable().optional(),
	success: z.boolean(),
	errorMessage: z.string().nullable().optional(),
	durationMs: z.number().nullable().optional(),
	createdAt: optionalDate,
}).passthrough()

export const GlobalSettingsRepositorySchema = z.object({
	errorAlertRecipients: z.array(z.string()).nullable().optional(),
	smtp: z
		.object({
			host: z.string(),
			port: z.number(),
			secure: z.boolean(),
			user: z.string().nullable().optional(),
			pass: z.string().nullable().optional(),
			from: z.string(),
		})
		.nullable()
		.optional(),
	motorPlugin: z
		.object({
			licenseKey: z.string(),
			status: z.enum(['active', 'invalid', 'revoked', 'unreachable']),
			plan: z.string().nullable().optional(),
			activatedAt: z.string().nullable().optional(),
			lastCheckedAt: z.string().nullable().optional(),
			lastError: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	updatedAt: optionalDate,
	updatedBy: optionalString,
}).passthrough()

export const ErrorEventRepositorySchema = z.object({
	id: z.string(),
	service: z.string(),
	failurePoint: z.string(),
	interviewId: optionalString,
	userId: optionalString,
	candidateName: optionalString,
	jobName: optionalString,
	companyId: optionalString,
	companyName: optionalString,
	questionId: optionalString,
	method: optionalString,
	retryCount: z.number().nullable().optional(),
	errorMessage: optionalString,
	errorStack: optionalString,
	extra: z.record(z.string(), z.unknown()).nullable().optional(),
	resolved: optionalBoolean,
	resolvedAt: optionalDate,
	resolvedBy: optionalString,
	createdAt: optionalDate,
}).passthrough()

export const AiUsageEventRepositorySchema = z.object({
	id: z.string(),
	companyId: z.string(),
	companyName: optionalString,
	occurredAt: z.string(),
	occurredDate: z.string(),
	occurredMonth: z.string(),
	source: z.enum(['ai_engine', 'orchestrator', 'core', 'whatsapp_interview', 'plugin_gateway']),
	surface: z.string(),
	provider: z.string(),
	model: z.string(),
	promptTokens: optionalNumber,
	cachedPromptTokens: optionalNumber,
	completionTokens: optionalNumber,
	totalTokens: optionalNumber,
	audioSeconds: optionalNumber,
	estimatedCostMicroUsd: optionalNumber,
	requestId: optionalString,
	jobAppliedId: optionalString,
	postJobId: optionalString,
	userId: optionalString,
	metadata: optionalRecord.nullable().optional(),
	createdAt: optionalString,
}).passthrough()




