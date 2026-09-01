import { relations } from 'drizzle-orm'
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core'

// ─── Companies ───────────────────────────────────────────────────────────────

export const companies = pgTable(
	'companies',
	{
		id: text('id').primaryKey(),
		companyName: text('companyName'),
		companyBio: text('companyBio'),
		companLogo: text('companLogo'),
		companyCity: text('companyCity'),
		companyCountry: text('companyCountry'),
		companyState: text('companyState'),
		companySize: text('companySize'),
		companyWebsite: text('companyWebsite'),
		companyId: text('companyId'),
		segment: text('segment'),
		ownerUserCompanyId: text('ownerUserCompanyId'),
		subscriptionPlan: text('subscriptionPlan'),
		subscriptionStatus: text('subscriptionStatus'),
		subscriptionId: text('subscriptionId'),
		stripeCustomerId: text('stripeCustomerId'),
		currentPeriodEnd: integer('currentPeriodEnd'),
		trialEnd: integer('trialEnd'),
		subscriptionStartAt: timestamp('subscriptionStartAt', { withTimezone: true }),
		subscriptionEndAt: timestamp('subscriptionEndAt', { withTimezone: true }),
		creditsMonthly: integer('creditsMonthly').default(0),
		creditsCourtesy: integer('creditsCourtesy').default(0),
		creditsFixed: integer('creditsFixed').default(0),
		trialCourtesyCreditsGranted: integer('trialCourtesyCreditsGranted').default(0),
		trialGrantedAt: timestamp('trialGrantedAt', { withTimezone: true }),
		featureUseEngineProcessing: boolean('featureUseEngineProcessing').default(false),
		objective: text('objective').array(),
		typeInterview: text('typeInterview').array(),
		headquartersCountries: text('headquartersCountries').array(),
		notificationsEmail: boolean('notificationsEmail'),
		notificationReportWeek: boolean('notificationReportWeek'),
		evaluateInternationalCandidates: boolean('evaluateInternationalCandidates'),
		whatsappBetaAccess: boolean('whatsappBetaAccess'),
		retro2025: text('retro2025'),
		/** Feature flags por tenant (Talent OS). Partial Record — default OFF. */
		featureFlags: jsonb('featureFlags').$type<Record<string, boolean>>(),
		/** Ações por etapa (V2-105): id da etapa → lista de ações. */
		stageActions: jsonb('stageActions').$type<Record<string, string[]>>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		nameIdx: index('companies_name_idx').on(t.companyName),
	}),
)

// ─── Users (candidates) ─────────────────────────────────────────────────────

export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey(),
		uuid: text('uuid'),
		display_name: text('display_name'),
		email: text('email'),
		phone_number: text('phone_number'),
		photo_url: text('photo_url'),
		language: text('language'),
		countryOfResidence: text('countryOfResidence'),
		countriesOfInterest: text('countriesOfInterest').array(),
		professionalObjectives: text('professionalObjectives'),
		resumeUrl: text('resumeUrl'),
		occupation: text('occupation'),
		level: text('level'),
		state: text('state'),
		city: text('city'),
		external_id: text('external_id'),
		professionalExperience: text('professionalExperience'),
		stripeCustomerId: text('stripeCustomerId'),
		paymentPaid: boolean('paymentPaid'),
		paymentPaidDate: timestamp('paymentPaidDate', { withTimezone: true }),
		paymentMessageError: text('paymentMessageError'),
		paymentDateError: timestamp('paymentDateError', { withTimezone: true }),
		dreamJobId: text('dreamJobId'),
		dreamJobAppliedId: text('dreamJobAppliedId'),
		dreamJobCreatedAt: timestamp('dreamJobCreatedAt', { withTimezone: true }),
		dreamJobStatus: text('dreamJobStatus'),
		dreamJobCompletedAt: timestamp('dreamJobCompletedAt', { withTimezone: true }),
		dreamJobGeneralFeedback: text('dreamJobGeneralFeedback'),
		created_time: timestamp('created_time', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		emailIdx: uniqueIndex('users_email_idx').on(t.email),
	}),
)

// ─── UsersCompany (company team members) ─────────────────────────────────────

export const usersCompany = pgTable(
	'users_company',
	{
		id: text('id').primaryKey(),
		uuid: text('uuid'),
		company_id: text('company_id').references(() => companies.id),
		display_name: text('display_name'),
		email: text('email'),
		first_name: text('first_name'),
		last_name: text('last_name'),
		occupation: text('occupation'),
		phone_number: text('phone_number'),
		photo_url: text('photo_url'),
		is_owner: boolean('is_owner'),
		access_level: text('access_level'),
		created_time: timestamp('created_time', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		emailIdx: index('users_company_email_idx').on(t.email),
		companyIdx: index('users_company_company_idx').on(t.company_id),
	}),
)

// ─── UserCompany Interview Tags ──────────────────────────────────────────────

export const userCompanyInterviewTags = pgTable(
	'user_company_interview_tags',
	{
		id: text('id').primaryKey(),
		user_company_id: text('user_company_id')
			.notNull()
			.references(() => usersCompany.id, { onDelete: 'cascade' }),
		interviewId: text('interviewId'),
		jobName: text('jobName'),
		tagCreatedAt: timestamp('tagCreatedAt', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		userCompanyIdx: index('ucit_user_company_idx').on(t.user_company_id),
	}),
)

export const userCompanyTagHardSkills = pgTable(
	'user_company_tag_hard_skills',
	{
		id: text('id').primaryKey(),
		tag_id: text('tag_id')
			.notNull()
			.references(() => userCompanyInterviewTags.id, { onDelete: 'cascade' }),
		categoria: text('categoria'),
		tag: text('tag'),
		area: text('area'),
		pontuacao: numeric('pontuacao'),
		nivel_evidencia: text('nivel_evidencia'),
		evidencia: text('evidencia'),
		contexto_uso: text('contexto_uso'),
		palavras_chave: text('palavras_chave').array(),
		tempo_experiencia: text('tempo_experiencia'),
		necessita_validacao: boolean('necessita_validacao'),
		sort_order: integer('sort_order').default(0),
	},
	(t) => ({
		tagIdx: index('ucths_tag_idx').on(t.tag_id),
	}),
)

export const userCompanyTagSoftSkills = pgTable(
	'user_company_tag_soft_skills',
	{
		id: text('id').primaryKey(),
		tag_id: text('tag_id')
			.notNull()
			.references(() => userCompanyInterviewTags.id, { onDelete: 'cascade' }),
		categoria: text('categoria'),
		tag: text('tag'),
		pontuacao: numeric('pontuacao'),
		nivel_evidencia: text('nivel_evidencia'),
		evidencia: text('evidencia'),
		sort_order: integer('sort_order').default(0),
	},
	(t) => ({
		tagIdx: index('uctss_tag_idx').on(t.tag_id),
	}),
)

export const userCompanyTagAnalysis = pgTable(
	'user_company_tag_analysis',
	{
		id: text('id').primaryKey(),
		tag_id: text('tag_id')
			.notNull()
			.unique()
			.references(() => userCompanyInterviewTags.id, { onDelete: 'cascade' }),
		senioridade_nivel: text('senioridade_nivel'),
		senioridade_score: numeric('senioridade_score'),
		senioridade_evidencias: text('senioridade_evidencias').array(),
		market_fit_score: numeric('market_fit_score'),
		market_fit_analise: text('market_fit_analise'),
		classificacao_perfil: text('classificacao_perfil'),
		classificacao_score: numeric('classificacao_score'),
		gaps_identificados: text('gaps_identificados').array(),
		gaps_recomendacoes: text('gaps_recomendacoes').array(),
		resumo_executivo: text('resumo_executivo'),
	},
	(t) => ({
		tagIdx: uniqueIndex('ucta_tag_idx').on(t.tag_id),
	}),
)

// ─── InfoJobs ────────────────────────────────────────────────────────────────

export const infoJobs = pgTable(
	'info_jobs',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		name: text('name'),
		finishText: text('finishText'),
		finishVideo: text('finishVideo'),
		welcomeText: text('welcomeText'),
		welcomeVideo: text('welcomeVideo'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('info_jobs_company_idx').on(t.company_id),
	}),
)

// ─── NotificationMessages ────────────────────────────────────────────────────

export const notificationMessages = pgTable(
	'notification_messages',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		name: text('name'),
		content: text('content'),
		type: text('type'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('notification_messages_company_idx').on(t.company_id),
	}),
)

// ─── PostJobs ────────────────────────────────────────────────────────────────

export const postJobs = pgTable(
	'post_jobs',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		jobId: text('jobId'),
		jobName: text('jobName'),
		identifier: text('identifier'),
		jobDescription: text('jobDescription'),
		employmentType: text('employmentType'),
		carrerLevel: text('carrerLevel'),
		language: text('language'),
		typeInterview: text('typeInterview'),
		interviewMode: text('interviewMode'),
		evaluateLanguage: boolean('evaluateLanguage').default(false),
		// 9 campos que ficaram sem coluna quando a distribuição open nasceu —
		// o decompose passava e o cleanForDb descartava em silêncio (o PATCH
		// respondia 200 e a intenção de contratação/régua/competências sumiam).
		kanbanConfig: jsonb('kanbanConfig'),
		evaluation: jsonb('evaluation'),
		competencias_criticas: text('competencias_criticas'),
		competencias_adicionais: text('competencias_adicionais'),
		expectativas: text('expectativas'),
		hiringIntent: text('hiringIntent'),
		freshnessSlaDays: integer('freshnessSlaDays'),
		lastActivityAt: timestamp('lastActivityAt', { withTimezone: true }),
		freshnessPausedAt: timestamp('freshnessPausedAt', { withTimezone: true }),
		// benefícios (Markdown) e faixa salarial de primeira classe — migration 0046
		benefits: text('benefits'),
		salary: text('salary'),
		profileInterview: boolean('profileInterview').default(false),
		antiGhostingEnabled: boolean('antiGhostingEnabled'),
		feedbackSlaHours: integer('feedbackSlaHours'),
		slaIrregularSince: timestamp('slaIrregularSince', { withTimezone: true }),
		slaAlertSentAt: timestamp('slaAlertSentAt', { withTimezone: true }),
		slaAutoStoppedAt: timestamp('slaAutoStoppedAt', { withTimezone: true }),
		slaAutoStoppedByAntiGhosting: boolean('slaAutoStoppedByAntiGhosting'),
		slaPublicBeforeAutoStop: boolean('slaPublicBeforeAutoStop'),
		jobResponsabilities: text('jobResponsabilities'),
		jobResponsibilities: text('jobResponsibilities'),
		jobRequirements: text('jobRequirements'),
		structuredRequirements: jsonb('structuredRequirements'),
		knockoutTree: jsonb('knockoutTree'),
		jobCategories: text('jobCategories'),
		jobModel: text('jobModel'),
		jobHours: text('jobHours'),
		companyName: text('companyName'),
		creatorId: text('creatorId'),
		// migration 0050 — quem cuida da vaga decide se o retorno automático sai
		sendCandidateFeedback: boolean('sendCandidateFeedback'),
		creatorName: text('creatorName'),
		creatorEmail: text('creatorEmail'),
		contractType: text('contractType'),
		screeningObjective: text('screeningObjective'),
		workModality: text('workModality'),
		mainSkills: text('mainSkills'),
		generatedJobDescription: text('generatedJobDescription'),
		limitNumberJobVacancies: text('limitNumberJobVacancies'),
		stopped: boolean('stopped'),
		archived: boolean('archived'),
		public: boolean('public'),
		priority: boolean('priority').notNull().default(false),
		limitedJobVacancy: boolean('limitedJobVacancy'),
		infoJobsBool: boolean('infoJobsBool'),
		requiresPreviousExperience: boolean('requiresPreviousExperience'),
		minimumAge: integer('minimumAge'),
		addressState: text('addressState'),
		addressCountry: text('addressCountry'),
		addressCity: text('addressCity'),
		educationalRequiements: text('educationalRequiements').array(),
		jdMetaCompanyDescription: text('jdMetaCompanyDescription'),
		jdMetaContractType: text('jdMetaContractType'),
		jdMetaBenefits: text('jdMetaBenefits'),
		jdMetaSalary: text('jdMetaSalary'),
		jdMetaGeneratedAt: timestamp('jdMetaGeneratedAt', { withTimezone: true }),
		jdMetaGeneratedBy: text('jdMetaGeneratedBy'),
		creatorUserCompanyId: text('creatorUserCompanyId').references(() => usersCompany.id),
		infoJobId: text('infoJobId').references(() => infoJobs.id),
		notificationMessageId: text('notificationMessageId').references(() => notificationMessages.id),
		orgUnitId: text('orgUnitId'),
		customFieldValues: jsonb('customFieldValues'),
		timeCreated: timestamp('timeCreated', { withTimezone: true }),
		closingDate: timestamp('closingDate', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('post_jobs_company_idx').on(t.company_id),
		timeCreatedIdx: index('post_jobs_time_created_idx').on(t.timeCreated),
	}),
)

// ─── PostJob Questions ───────────────────────────────────────────────────────

export const postJobQuestions = pgTable(
	'post_job_questions',
	{
		id: text('id').notNull(),
		post_job_id: text('post_job_id')
			.notNull()
			.references(() => postJobs.id, { onDelete: 'cascade' }),
		question: text('question'),
		audioUrl: text('audioUrl'),
		level: text('level'),
		peso: numeric('peso'),
		skills: text('skills'),
		finish: boolean('finish'),
		sort_order: integer('sort_order').default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		postJobIdx: index('post_job_questions_post_job_idx').on(t.post_job_id),
		pk: uniqueIndex('post_job_questions_pk').on(t.post_job_id, t.id),
	}),
)

// ─── PostJob Additional Questions ────────────────────────────────────────────

export const postJobAdditionalQuestions = pgTable(
	'post_job_additional_questions',
	{
		id: text('id').notNull(),
		post_job_id: text('post_job_id')
			.notNull()
			.references(() => postJobs.id, { onDelete: 'cascade' }),
		question: text('question'),
		audioUrl: text('audioUrl'),
		level: text('level'),
		peso: numeric('peso'),
		skills: text('skills'),
		finish: boolean('finish'),
		sort_order: integer('sort_order').default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		postJobIdx: index('post_job_additional_questions_post_job_idx').on(t.post_job_id),
		pk: uniqueIndex('post_job_additional_questions_pk').on(t.post_job_id, t.id),
	}),
)

// ─── JobsApplied ─────────────────────────────────────────────────────────────

export const jobsApplied = pgTable(
	'jobs_applied',
	{
		id: text('id').primaryKey(),
		user_id: text('user_id').notNull().references(() => users.id),
		post_job_id: text('post_job_id').references(() => postJobs.id),
		company_id: text('company_id').references(() => companies.id),
		finished: boolean('finished').default(false),
		candidateStatus: text('candidateStatus'),
		isPracticing: boolean('isPracticing'),
		engineBatchId: text('engineBatchId'),
		engineBatchStatus: text('engineBatchStatus'),
		typeInterview: text('typeInterview'),
		appliedTime: timestamp('appliedTime', { withTimezone: true }),
		finishedTime: timestamp('finishedTime', { withTimezone: true }),
		// reivindicação atômica do finish (migration 0049) — evita que dois
		// gatilhos rodem o pipeline em paralelo e dupliquem e-mail e análise
		finishStartedAt: timestamp('finishStartedAt', { withTimezone: true }),
		dateSelect: timestamp('dateSelect', { withTimezone: true }),
		rejectionReasonCode: text('rejectionReasonCode'),
		rejectionReasonLabel: text('rejectionReasonLabel'),
		rejectionNote: text('rejectionNote'),
		rejectionFeedbackSentAt: timestamp('rejectionFeedbackSentAt', { withTimezone: true }),
		rejectionDecisionSource: text('rejectionDecisionSource'),
		rejectionDecidedByUserId: text('rejectionDecidedByUserId'),
		rejectionTaxonomyVersion: text('rejectionTaxonomyVersion'),
		rejectionEvidence: text('rejectionEvidence'),
		rejectionRiskFlags: text('rejectionRiskFlags').array(),
		ackSentAt: timestamp('ackSentAt', { withTimezone: true }),
		appliedWithoutInterview: boolean('appliedWithoutInterview'),
		applicationDraft: jsonb('applicationDraft'),
		screeningKnockoutAnswers: jsonb('screeningKnockoutAnswers'),
		screeningKnockoutResult: jsonb('screeningKnockoutResult'),
		screeningKnockoutTreeSnapshot: jsonb('screeningKnockoutTreeSnapshot'),
		// Prova de entrevista verificada (OTS) apresentada no apply — snapshot
		// da verificação .
		otsAttestation: jsonb('otsAttestation'),
		whatsappFeedbackGeral: text('whatsappFeedbackGeral'),
		whatsappPorcentagemMatch: numeric('whatsappPorcentagemMatch'),
		whatsappRecomendacao: text('whatsappRecomendacao'),
		whatsappRequisitosAtendidos: text('whatsappRequisitosAtendidos').array(),
		whatsappRequisitosNaoAtendidos: text('whatsappRequisitosNaoAtendidos').array(),
		whatsappPontosAtencao: text('whatsappPontosAtencao').array(),
		// Bloco final da avaliação de proficiência de idioma (JSONB):
		// { score, nivel, feedback, analise }. Populado só quando
		// PostJob.evaluateLanguage = true. Nulo caso contrário.
		languageEvaluation: jsonb('languageEvaluation'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		userIdx: index('jobs_applied_user_idx').on(t.user_id),
		companyIdx: index('jobs_applied_company_idx').on(t.company_id),
		postJobIdx: index('jobs_applied_post_job_idx').on(t.post_job_id),
		finishedIdx: index('jobs_applied_finished_idx').on(t.finished),
	}),
)

export const rejectionReviewRequests = pgTable(
	'rejection_review_requests',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId').notNull().references(() => companies.id, { onDelete: 'cascade' }),
		jobId: text('jobId').notNull().references(() => postJobs.id, { onDelete: 'cascade' }),
		jobAppliedId: text('jobAppliedId').notNull().references(() => jobsApplied.id, { onDelete: 'cascade' }),
		candidateUserId: text('candidateUserId').notNull().references(() => users.id, { onDelete: 'cascade' }),
		status: text('status').notNull(),
		requestedAt: timestamp('requestedAt', { withTimezone: true }).notNull(),
		candidateMessage: text('candidateMessage'),
		reviewedByUserId: text('reviewedByUserId'),
		reviewedAt: timestamp('reviewedAt', { withTimezone: true }),
		reviewerNote: text('reviewerNote'),
		outcomeMessage: text('outcomeMessage'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		jobAppliedIdx: uniqueIndex('rejection_review_requests_job_applied_idx').on(t.jobAppliedId),
		companyStatusRequestedIdx: index('rejection_review_requests_company_status_requested_idx').on(
			t.companyId,
			t.status,
			t.requestedAt,
		),
	}),
)

// ─── ExitJobResults ──────────────────────────────────────────────────────────

export const exitJobResults = pgTable('exit_job_results', {
	id: text('id').primaryKey(),
	job_applied_id: text('job_applied_id')
		.notNull()
		.unique()
		.references(() => jobsApplied.id, { onDelete: 'cascade' }),
	feedbackGeral: text('feedbackGeral'),
	porcentagemMatch: numeric('porcentagemMatch'),
	recomendacao: text('recomendacao'),
	pontosFortes: text('pontosFortes').array(),
	pontosAtencao: text('pontosAtencao').array(),
	areasMelhoria: text('areasMelhoria').array(),
	score: numeric('score'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── InterviewAnswers ────────────────────────────────────────────────────────

export const interviewAnswers = pgTable(
	'interview_answers',
	{
		id: text('id').notNull(),
		job_applied_id: text('job_applied_id')
			.notNull()
			.references(() => jobsApplied.id, { onDelete: 'cascade' }),
		question: text('question'),
		answer: text('answer'),
		captionSegments: jsonb('captionSegments'),
		captionTranslations: jsonb('captionTranslations'),
		finished: boolean('finished').default(false),
		video: text('video'),
		audio: text('audio'),
		skills: text('skills'),
		score: numeric('score'),
		feedback: text('feedback'),
		analyze: text('analyze'),
		qRecomendation: text('qRecomendation'),
		transcription_status: text('transcription_status'),
		pulou_a_pergunta: boolean('pulou_a_pergunta'),
		improvement: text('improvement').array(),
		strengths: text('strengths').array(),
		metricas_decisao: text('metricas_decisao'),
		qualidade_profundidade: numeric('qualidade_profundidade'),
		qualidade_estruturacao: numeric('qualidade_estruturacao'),
		qualidade_exemplificacao: numeric('qualidade_exemplificacao'),
		senioridade_alinhamento_nivel: numeric('senioridade_alinhamento_nivel'),
		senioridade_gap_proximo_nivel: numeric('senioridade_gap_proximo_nivel'),
		avaliacao_score: numeric('avaliacao_score'),
		avaliacao_recomendacao: text('avaliacao_recomendacao'),
		avaliacao_motivo_revisao: text('avaliacao_motivo_revisao'),
		avaliacao_precisa_revisao: boolean('avaliacao_precisa_revisao'),
		avaliacao_sugestoes_melhoria: text('avaliacao_sugestoes_melhoria').array(),
		// ── Avaliação de proficiência de idioma por pergunta ───────────────
		// Populado só quando PostJob.evaluateLanguage = true. Campos separados
		// dos técnicos (`score`/`feedback`) — nunca reusados.
		languageScore: numeric('languageScore'),
		languageFeedback: text('languageFeedback'),
		languageAnalise: text('languageAnalise'),
		sort_order: integer('sort_order').default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		jobAppliedIdx: index('interview_answers_job_applied_idx').on(t.job_applied_id),
		pk: uniqueIndex('interview_answers_pk').on(t.job_applied_id, t.id),
	}),
)

// ─── Answer Competencias ─────────────────────────────────────────────────────

export const answerCompetencias = pgTable(
	'answer_competencias',
	{
		id: text('id').primaryKey(),
		job_applied_id: text('job_applied_id').notNull(),
		answer_id: text('answer_id').notNull(),
		source: text('source').notNull(),
		type: text('type').notNull(),
		nome: text('nome'),
		pontuacao: numeric('pontuacao'),
		score: numeric('score'),
		pontos_fortes: text('pontos_fortes').array(),
		pontos_desenvolvimento: text('pontos_desenvolvimento').array(),
		sort_order: integer('sort_order').default(0),
	},
	(t) => ({
		answerFk: foreignKey({
			columns: [t.job_applied_id, t.answer_id],
			foreignColumns: [interviewAnswers.job_applied_id, interviewAnswers.id],
		}).onDelete('cascade'),
		answerIdx: index('answer_competencias_answer_idx').on(t.job_applied_id, t.answer_id),
	}),
)

// ─── Answer Expectativas ─────────────────────────────────────────────────────

export const answerExpectativas = pgTable(
	'answer_expectativas',
	{
		id: text('id').primaryKey(),
		job_applied_id: text('job_applied_id').notNull(),
		answer_id: text('answer_id').notNull(),
		source: text('source').notNull(),
		nome: text('nome'),
		nivel_atendimento: numeric('nivel_atendimento'),
		evidencias: text('evidencias').array(),
		gaps: text('gaps').array(),
		sort_order: integer('sort_order').default(0),
	},
	(t) => ({
		answerFk: foreignKey({
			columns: [t.job_applied_id, t.answer_id],
			foreignColumns: [interviewAnswers.job_applied_id, interviewAnswers.id],
		}).onDelete('cascade'),
		answerIdx: index('answer_expectativas_answer_idx').on(t.job_applied_id, t.answer_id),
	}),
)

// ─── AdditionalAnswers ───────────────────────────────────────────────────────

export const additionalAnswers = pgTable(
	'additional_answers',
	{
		id: text('id').notNull(),
		job_applied_id: text('job_applied_id')
			.notNull()
			.references(() => jobsApplied.id, { onDelete: 'cascade' }),
		question: text('question'),
		answer: text('answer'),
		finished: boolean('finished').default(false),
		video: text('video'),
		audio: text('audio'),
		sort_order: integer('sort_order').default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		jobAppliedIdx: index('additional_answers_job_applied_idx').on(t.job_applied_id),
		pk: uniqueIndex('additional_answers_pk').on(t.job_applied_id, t.id),
	}),
)

// ─── InterviewResults ────────────────────────────────────────────────────────

export const interviewResults = pgTable(
	'interview_results',
	{
		id: text('id').primaryKey(),
		job_applied_id: text('job_applied_id')
			.notNull()
			.unique()
			.references(() => jobsApplied.id, { onDelete: 'cascade' }),
		generalFeedback: text('generalFeedback'),
		recomentation: text('recomentation'),
		score: text('score'),
		job: text('job'),
		leveljob: text('leveljob'),
		state: boolean('state'),
		scom: numeric('scom'),
		sres: numeric('sres'),
		stec: numeric('stec'),
		aderencia_descricao: numeric('aderencia_descricao'),
		alinhamento_responsabilidades: numeric('alinhamento_responsabilidades'),
		alinhamento_nivel: numeric('alinhamento_nivel'),
		totalAderencia: numeric('totalAderencia'),
		totalAlinhamentoResponsabilidade: numeric('totalAlinhamentoResponsabilidade'),
		totalAlinhamentoNivel: numeric('totalAlinhamentoNivel'),
		generalStrengths: text('generalStrengths').array(),
		generalImprovement: text('generalImprovement').array(),
		translationCache: jsonb('translationCache'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		jobAppliedIdx: uniqueIndex('interview_results_job_applied_idx').on(t.job_applied_id),
	}),
)

// ─── Cheat Detection ─────────────────────────────────────────────────────────

export const cheatDetection = pgTable(
	'cheat_detection',
	{
		id: text('id').primaryKey(),
		interview_result_id: text('interview_result_id')
			.notNull()
			.unique()
			.references(() => interviewResults.id, { onDelete: 'cascade' }),
		pontuacao_autenticidade: numeric('pontuacao_autenticidade'),
		nivel_confianca: text('nivel_confianca'),
		parecer_principal: text('parecer_principal'),
		fatores_criticos: text('fatores_criticos').array(),
		padroes_identificados: text('padroes_identificados').array(),
		consideracoes_contextuais: text('consideracoes_contextuais').array(),
		nivel_risco: text('nivel_risco'),
		acoes_sugeridas: text('acoes_sugeridas').array(),
		perguntas_validacao: text('perguntas_validacao').array(),
		consideracoes_eticas: text('consideracoes_eticas').array(),
		confiabilidade_analise: numeric('confiabilidade_analise'),
		limitacoes_aplicaveis: text('limitacoes_aplicaveis').array(),
		versao_prompt: text('versao_prompt'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		resultIdx: uniqueIndex('cheat_detection_result_idx').on(t.interview_result_id),
	}),
)

export const cheatDetectionIndicators = pgTable(
	'cheat_detection_indicators',
	{
		id: text('id').primaryKey(),
		cheat_detection_id: text('cheat_detection_id')
			.notNull()
			.references(() => cheatDetection.id, { onDelete: 'cascade' }),
		type: text('type').notNull(),
		indicador: text('indicador'),
		descricao: text('descricao'),
		score: numeric('score'),
		evidencias: text('evidencias').array(),
		sort_order: integer('sort_order').default(0),
	},
	(t) => ({
		cheatIdx: index('cheat_indicators_cheat_idx').on(t.cheat_detection_id),
	}),
)

export const cheatDetectionResponses = pgTable(
	'cheat_detection_responses',
	{
		id: text('id').primaryKey(),
		cheat_detection_id: text('cheat_detection_id')
			.notNull()
			.references(() => cheatDetection.id, { onDelete: 'cascade' }),
		answer_id: text('answer_id'),
		parecer: text('parecer'),
		score_autenticidade: numeric('score_autenticidade'),
		indicadores: text('indicadores').array(),
		observacoes: text('observacoes').array(),
		sort_order: integer('sort_order').default(0),
	},
	(t) => ({
		cheatIdx: index('cheat_responses_cheat_idx').on(t.cheat_detection_id),
	}),
)

// ─── AvaliacaoFinal ──────────────────────────────────────────────────────────

export const avaliacaoFinal = pgTable(
	'avaliacao_final',
	{
		id: text('id').primaryKey(),
		job_applied_id: text('job_applied_id')
			.notNull()
			.unique()
			.references(() => jobsApplied.id, { onDelete: 'cascade' }),
		generalFeedback: text('generalFeedback'),
		generalRecomendation: text('generalRecomendation'),
		score: numeric('score'),
		pontuacao_final: numeric('pontuacao_final'),
		nivel: text('nivel'),
		resumo: text('resumo'),
		recomendacoes_pontos_fortes: text('recomendacoes_pontos_fortes').array(),
		recomendacoes_areas_desenvolvimento: text('recomendacoes_areas_desenvolvimento').array(),
		recomendacoes_sugestoes_melhoria: text('recomendacoes_sugestoes_melhoria').array(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		jobAppliedIdx: uniqueIndex('avaliacao_final_job_applied_idx').on(t.job_applied_id),
	}),
)

export const avaliacaoCompetencias = pgTable(
	'avaliacao_competencias',
	{
		id: text('id').primaryKey(),
		avaliacao_final_id: text('avaliacao_final_id')
			.notNull()
			.references(() => avaliacaoFinal.id, { onDelete: 'cascade' }),
		type: text('type').notNull(),
		nome: text('nome'),
		pontuacao: numeric('pontuacao'),
		score: numeric('score'),
		pontos_fortes: text('pontos_fortes').array(),
		pontos_desenvolvimento: text('pontos_desenvolvimento').array(),
		sort_order: integer('sort_order').default(0),
	},
	(t) => ({
		avaliacaoIdx: index('avaliacao_competencias_avaliacao_idx').on(t.avaliacao_final_id),
	}),
)

export const avaliacaoExpectativas = pgTable(
	'avaliacao_expectativas',
	{
		id: text('id').primaryKey(),
		avaliacao_final_id: text('avaliacao_final_id')
			.notNull()
			.references(() => avaliacaoFinal.id, { onDelete: 'cascade' }),
		nome: text('nome'),
		nivel_atendimento: numeric('nivel_atendimento'),
		evidencias: text('evidencias').array(),
		gaps: text('gaps').array(),
		sort_order: integer('sort_order').default(0),
	},
	(t) => ({
		avaliacaoIdx: index('avaliacao_expectativas_avaliacao_idx').on(t.avaliacao_final_id),
	}),
)

// ─── BatchProcessing ─────────────────────────────────────────────────────────

export const batchProcessing = pgTable(
	'batch_processing',
	{
		id: text('id').primaryKey(),
		job_applied_id: text('job_applied_id')
			.notNull()
			.unique()
			.references(() => jobsApplied.id, { onDelete: 'cascade' }),
		status: text('status'),
		engineBatchId: text('engineBatchId'),
		openaiBatchId: text('openaiBatchId'),
		openaiFileId: text('openaiFileId'),
		error: text('error'),
		fastTrackedBy: text('fastTrackedBy'),
		fastTrackedAt: timestamp('fastTrackedAt', { withTimezone: true }),
		questionsProcessed: integer('questionsProcessed'),
		totalQuestions: integer('totalQuestions'),
		totalTokensUsed: integer('totalTokensUsed'),
		promptTokensUsed: integer('promptTokensUsed'),
		completionTokensUsed: integer('completionTokensUsed'),
		queuedAt: timestamp('queuedAt', { withTimezone: true }),
		processingStartedAt: timestamp('processingStartedAt', { withTimezone: true }),
		completedAt: timestamp('completedAt', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		jobAppliedIdx: uniqueIndex('batch_processing_job_applied_idx').on(t.job_applied_id),
	}),
)

// ─── CandidateLikes ──────────────────────────────────────────────────────────

export const candidateLikes = pgTable(
	'candidate_likes',
	{
		id: text('id').primaryKey(),
		job_applied_id: text('job_applied_id')
			.notNull()
			.references(() => jobsApplied.id, { onDelete: 'cascade' }),
		user_id: text('user_id'),
		name: text('name'),
		avatar_url: text('avatar_url'),
		email: text('email'),
		action: boolean('action'),
		created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		jobAppliedIdx: index('candidate_likes_job_applied_idx').on(t.job_applied_id),
	}),
)

// ─── CreditsUsed ─────────────────────────────────────────────────────────────

export const creditsUsed = pgTable(
	'credits_used',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		companyOwner: text('companyOwner'),
		debitedFrom: text('debitedFrom'),
		feature: text('feature'),
		userId: text('userId'),
		jobApplied: text('jobApplied'),
		postJobId: text('postJobId'),
		usedBy: text('usedBy'),
		usedByName: text('usedByName'),
		source: text('source'),
		ip: text('ip'),
		userAgent: text('userAgent'),
		jobName: text('jobName'),
		candidateName: text('candidateName'),
		score: text('score'),
		isHunting: boolean('isHunting'),
		usedAt: timestamp('usedAt', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('credits_used_company_idx').on(t.company_id),
		featureIdx: index('credits_used_feature_idx').on(t.feature),
		userIdx: index('credits_used_user_idx').on(t.userId),
	}),
)

// ─── Collaborators ───────────────────────────────────────────────────────────

export const collaborators = pgTable(
	'collaborators',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		user_company_id: text('user_company_id').references(() => usersCompany.id),
		name: text('name'),
		email: text('email'),
		password: text('password'),
		accessLevel: text('accessLevel'),
		// migration 0050 — substitui a lista negra do Postmark como forma de recusar
		notifyOnInterviewFinish: boolean('notifyOnInterviewFinish'),
		status: boolean('status'),
		creationDate: timestamp('creationDate', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('collaborators_company_idx').on(t.company_id),
	}),
)

// ─── Scorecards (V2-302) ─────────────────────────────────────────────────────

export const scorecards = pgTable(
	'scorecards',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id')
			.notNull()
			.references(() => companies.id),
		jobId: text('jobId').notNull(),
		candidateId: text('candidateId').notNull(),
		authorId: text('authorId').notNull(),
		authorName: text('authorName'),
		criteria: jsonb('criteria').notNull().default([]),
		recommendation: text('recommendation').notNull(),
		comment: text('comment'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }),
	},
	(t) => ({
		lookupIdx: index('scorecards_lookup_idx').on(t.company_id, t.jobId, t.candidateId),
	}),
)

// ─── Org units e custom fields (V2-501 / V2-502) ─────────────────────────────

/**
 * Consentimento e trilha de auditoria LGPD (V2-701).
 *
 * Sem FK para `users`: a trilha precisa sobreviver à exclusão do titular —
 * apagar a prova de que a exclusão aconteceu é o oposto do ponto.
 */
/** Taxonomia pública (V2-801): não é dado de tenant, não tem companyId. */
export const occupations = pgTable(
	'occupations',
	{
		id: text('id').primaryKey(),
		source: text('source').notNull(),
		code: text('code').notNull(),
		title: text('title').notNull(),
		synonyms: jsonb('synonyms').notNull().default([]),
		familyCode: text('familyCode'),
		groupCode: text('groupCode'),
		mappedTo: text('mappedTo'),
		taxonomyVersion: text('taxonomyVersion').notNull(),
		language: text('language'),
	},
	(t) => ({
		versionIdx: index('occupations_version_idx').on(t.taxonomyVersion),
	}),
)

export const skills = pgTable(
	'skills',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		synonyms: jsonb('synonyms').notNull().default([]),
		category: text('category'),
		source: text('source'),
		taxonomyVersion: text('taxonomyVersion').notNull(),
		pendingCuration: boolean('pendingCuration').default(false),
		occurrences: integer('occurrences').default(0),
	},
	(t) => ({
		versionIdx: index('skills_version_idx').on(t.taxonomyVersion),
	}),
)

export const dataConsents = pgTable(
	'data_consents',
	{
		id: text('id').primaryKey(),
		userId: text('userId').notNull(),
		companyId: text('companyId'),
		purpose: text('purpose').notNull(),
		granted: boolean('granted').notNull().default(true),
		grantedAt: timestamp('grantedAt', { withTimezone: true }),
		expiresAt: timestamp('expiresAt', { withTimezone: true }),
		revokedAt: timestamp('revokedAt', { withTimezone: true }),
		policyVersion: text('policyVersion'),
		source: text('source'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		userIdx: index('data_consents_user_idx').on(t.userId),
	}),
)

export const dataSubjectRequests = pgTable(
	'data_subject_requests',
	{
		id: text('id').primaryKey(),
		userId: text('userId').notNull(),
		companyId: text('companyId'),
		operation: text('operation').notNull(),
		status: text('status').notNull().default('pending'),
		requestedAt: timestamp('requestedAt', { withTimezone: true }).notNull().defaultNow(),
		completedAt: timestamp('completedAt', { withTimezone: true }),
		requestedBy: text('requestedBy'),
		affected: jsonb('affected'),
		error: text('error'),
	},
	(t) => ({
		userIdx: index('data_subject_requests_user_idx').on(t.userId),
	}),
)

export const orgUnits = pgTable(
	'org_units',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id')
			.notNull()
			.references(() => companies.id),
		kind: text('kind').notNull(),
		name: text('name').notNull(),
		externalCode: text('externalCode'),
		parentId: text('parentId'),
		active: boolean('active').default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }),
	},
	(t) => ({
		companyKindIdx: index('org_units_company_kind_idx').on(t.company_id, t.kind),
	}),
)

export const customFields = pgTable(
	'custom_fields',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id')
			.notNull()
			.references(() => companies.id),
		entity: text('entity').notNull(),
		key: text('key').notNull(),
		label: text('label').notNull(),
		type: text('type').notNull(),
		options: jsonb('options').$type<string[]>(),
		required: boolean('required').default(false),
		order: integer('order').default(0),
		active: boolean('active').default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyEntityIdx: index('custom_fields_company_entity_idx').on(t.company_id, t.entity),
	}),
)

export const emailTemplates = pgTable('email_templates', {
	id: text('id').primaryKey(),
	company_id: text('company_id')
		.notNull()
		.references(() => companies.id),
	kind: text('kind').notNull(),
	subject: text('subject').notNull(),
	body: text('body').notNull(),
	active: boolean('active').default(true),
	updatedByUserId: text('updatedByUserId'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }),
})

// ─── Offers (V2-402) ─────────────────────────────────────────────────────────

export const offers = pgTable(
	'offers',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id')
			.notNull()
			.references(() => companies.id),
		jobId: text('jobId').notNull(),
		candidateId: text('candidateId').notNull(),
		salaryMinor: integer('salaryMinor').notNull(),
		currency: text('currency').notNull(),
		contractType: text('contractType'),
		startDate: timestamp('startDate', { withTimezone: true }),
		notes: text('notes'),
		status: text('status').notNull(),
		sentAt: timestamp('sentAt', { withTimezone: true }),
		respondedAt: timestamp('respondedAt', { withTimezone: true }),
		declineReason: text('declineReason'),
		createdByUserId: text('createdByUserId').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }),
	},
	(t) => ({
		lookupIdx: index('offers_lookup_idx').on(t.company_id, t.jobId, t.candidateId),
	}),
)

// ─── Job requisitions (V2-401) ───────────────────────────────────────────────

export const jobRequisitions = pgTable(
	'job_requisitions',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id')
			.notNull()
			.references(() => companies.id),
		title: text('title').notNull(),
		area: text('area'),
		reason: text('reason'),
		headcount: integer('headcount').default(1),
		salaryRangeMin: integer('salaryRangeMin'),
		salaryRangeMax: integer('salaryRangeMax'),
		currency: text('currency'),
		requestedByUserId: text('requestedByUserId').notNull(),
		requestedByName: text('requestedByName'),
		status: text('status').notNull(),
		decidedByUserId: text('decidedByUserId'),
		decidedByName: text('decidedByName'),
		decidedAt: timestamp('decidedAt', { withTimezone: true }),
		decisionNote: text('decisionNote'),
		jobId: text('jobId'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }),
	},
	(t) => ({
		companyStatusIdx: index('job_requisitions_company_status_idx').on(t.company_id, t.status),
	}),
)

// ─── Candidate timeline (V2-303) ─────────────────────────────────────────────

export const candidateTimeline = pgTable(
	'candidate_timeline',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id')
			.notNull()
			.references(() => companies.id),
		jobId: text('jobId').notNull(),
		candidateId: text('candidateId').notNull(),
		type: text('type').notNull(),
		authorId: text('authorId'),
		authorName: text('authorName'),
		body: text('body'),
		metadata: jsonb('metadata'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }),
	},
	(t) => ({
		lookupIdx: index('candidate_timeline_lookup_idx').on(t.company_id, t.jobId, t.candidateId),
	}),
)

// ─── CompanyNotifications ────────────────────────────────────────────────────

export const companyNotifications = pgTable(
	'company_notifications',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		type: text('type'),
		dateTime: timestamp('dateTime', { withTimezone: true }),
		read: boolean('read'),
		userId: text('userId'),
		jobAppliedId: text('jobAppliedId'),
		/*
		 * O que o domínio (`CompanyNotification`) usa de fato. Faltavam todas —
		 * e como `cleanForDb` descarta chave sem coluna, a notificação que o
		 * orchestrator grava ao finalizar a entrevista entrava VAZIA e derrubava
		 * a listagem inteira com 400. Migration 0048.
		 */
		title: text('title'),
		message: text('message'),
		status: boolean('status'),
		actionRef: text('actionRef'),
		postId: text('postId'),
		image: text('image'),
		/*
		 * Legado sem uso: nasceram com a tabela e nada no código escreve ou lê
		 * (grep em 2026-08-25). Ficam porque estão sempre nulas e derrubá-las
		 * numa instalação de cliente não paga o risco — mas NÃO são o lugar do
		 * título; esse é `title` acima.
		 */
		notificationTitle: text('notificationTitle'),
		notificationMessage: text('notificationMessage'),
		notificationMetadata: text('notificationMetadata'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('company_notifications_company_idx').on(t.company_id),
		dateTimeIdx: index('company_notifications_datetime_idx').on(t.dateTime),
	}),
)

// ─── NPS ─────────────────────────────────────────────────────────────────────

export const nps = pgTable(
	'nps',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		jobId: text('jobId'),
		jobName: text('jobName'),
		candidateId: text('candidateId'),
		candidateName: text('candidateName'),
		candidateEmail: text('candidateEmail'),
		jobApplied: text('jobApplied'),
		photo_url: text('photo_url'),
		interviewType: text('interviewType'),
		comment: text('comment'),
		score: numeric('score'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('nps_company_idx').on(t.company_id),
	}),
)

// ─── InterviewAbandonments ───────────────────────────────────────────────────

export const interviewAbandonments = pgTable(
	'interview_abandonments',
	{
		id: text('id').primaryKey(),
		interviewId: text('interviewId').notNull(),
		jobId: text('jobId').notNull(),
		companyId: text('companyId').notNull(),
		userId: text('userId'),
		reason: text('reason').notNull(),
		comment: text('comment'),
		questionIndex: integer('questionIndex'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('interview_abandonments_company_idx').on(t.companyId),
		jobIdx: index('interview_abandonments_job_idx').on(t.jobId),
		interviewIdx: index('interview_abandonments_interview_idx').on(t.interviewId),
	}),
)

// ─── SubscriptionHistory ─────────────────────────────────────────────────────

export const subscriptionHistory = pgTable(
	'subscription_history',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		action: text('action'),
		operationId: text('operationId'),
		mode: text('mode'),
		customerId: text('customerId'),
		status: text('status'),
		plan: text('plan'),
		eventId: text('eventId'),
		timestamp: integer('timestamp'),
		detailPreviousStatus: text('detailPreviousStatus'),
		detailNewStatus: text('detailNewStatus'),
		detailCurrentPeriodEnd: integer('detailCurrentPeriodEnd'),
		detailTrialEnd: integer('detailTrialEnd'),
		detailAmount: numeric('detailAmount'),
		detailCurrency: text('detailCurrency'),
		detailReason: text('detailReason'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('subscription_history_company_idx').on(t.company_id),
	}),
)

// ─── JobPortal ───────────────────────────────────────────────────────────────

export const jobPortal = pgTable(
	'job_portal',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').references(() => companies.id),
		bannerUrl: text('bannerUrl'),
		bannerPosition: integer('bannerPosition'),
		socialLinks: jsonb('socialLinks'),
		defaultDomainUrl: text('defaultDomainUrl'),
		logoUrl: text('logoUrl'),
		primaryColor: text('primaryColor'),
		textColor: text('textColor'),
		isProfileVisible: boolean('isProfileVisible'),
		// "sobre a empresa" (Markdown) + vídeo institucional — migration 0046
		about: text('about'),
		videoUrl: text('videoUrl'),
	},
	(t) => ({
		companyIdx: index('job_portal_company_idx').on(t.company_id),
	}),
)

// ─── StripeWebhookHistory ────────────────────────────────────────────────────

export const stripeWebhookHistory = pgTable('stripe_webhook_history', {
	id: text('id').primaryKey(),
	event: text('event'),
	rawPayload: text('rawPayload'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── InsightsCache ───────────────────────────────────────────────────────────

export const insightsCache = pgTable(
	'insights_cache',
	{
		id: text('id').primaryKey(),
		company_id: text('company_id').notNull().references(() => companies.id),
		companyId: text('companyId'),
		language: text('language'),
		insight: text('insight'),
		generatedAt: timestamp('generatedAt', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('insights_cache_company_idx').on(t.company_id),
	}),
)

// ─── Batches ─────────────────────────────────────────────────────────────────

export const batches = pgTable(
	'batches',
	{
		id: text('id').primaryKey(),
		type: text('type'),
		status: text('status'),
		interviewId: text('interviewId'),
		userId: text('userId'),
		companyId: text('companyId'),
		jobAppliedPath: text('jobAppliedPath'),
		openaiBatchId: text('openaiBatchId'),
		openaiFileId: text('openaiFileId'),
		openaiOutputFileId: text('openaiOutputFileId'),
		totalItems: integer('totalItems'),
		processedItems: integer('processedItems'),
		totalTokensUsed: integer('totalTokensUsed'),
		promptTokensUsed: integer('promptTokensUsed'),
		completionTokensUsed: integer('completionTokensUsed'),
		processingMode: text('processingMode'),
		requestedBy: text('requestedBy'),
		error: text('error'),
		completedAt: timestamp('completedAt', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		statusIdx: index('batches_status_idx').on(t.status),
		interviewIdx: index('batches_interview_idx').on(t.interviewId),
	}),
)

// ─── InterviewWhatsapp ───────────────────────────────────────────────────────

export const interviewWhatsapp = pgTable('interview_whatsapp', {
	id: text('id').primaryKey(),
	jobId: text('jobId'),
	companyId: text('companyId'),
	typeInterview: text('typeInterview'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Views ──────────────────────────────────────────────────────────────────

export const companyInterviewsView = pgTable('company_interviews_view', {
	id: text('id'),
	company_id: text('company_id'),
	post_job_id: text('post_job_id'),
	user_id: text('user_id'),
	finished: boolean('finished'),
	finish: boolean('finish'),
	candidateStatus: text('candidateStatus'),
	date: timestamp('date', { withTimezone: true }),
	dateSelect: timestamp('dateSelect', { withTimezone: true }),
	rejectionReasonCode: text('rejectionReasonCode'),
	rejectionReasonLabel: text('rejectionReasonLabel'),
	rejectionNote: text('rejectionNote'),
	rejectionFeedbackSentAt: timestamp('rejectionFeedbackSentAt', { withTimezone: true }),
	rejectionDecisionSource: text('rejectionDecisionSource'),
	rejectionDecidedByUserId: text('rejectionDecidedByUserId'),
	rejectionTaxonomyVersion: text('rejectionTaxonomyVersion'),
	rejectionEvidence: text('rejectionEvidence'),
	rejectionRiskFlags: text('rejectionRiskFlags').array(),
	ackSentAt: timestamp('ackSentAt', { withTimezone: true }),
	score: text('score'),
	name: text('name'),
	photo_url: text('photo_url'),
	occupation: text('occupation'),
	external_id: text('external_id'),
	professionalExperience: text('professionalExperience'),
	phone_number: text('phone_number'),
	state: text('state'),
	city: text('city'),
	email: text('email'),
	carrerLevel: text('carrerLevel'),
	jobName: text('jobName'),
	jobDescription: text('jobDescription'),
	typeInterview: text('typeInterview'),
	stopped: boolean('stopped'),
	job_applied_ref: jsonb('job_applied_ref'),
	user_ref: jsonb('user_ref'),
	job_ref: jsonb('job_ref'),
})

export const publicInterviewsView = pgTable('public_interviews', {
	id: text('id'),
	company_id: text('company_id'),
	date: timestamp('date', { withTimezone: true }),
	email: text('email'),
	external_id: text('external_id'),
	job_applied_ref: jsonb('job_applied_ref'),
	jobName: text('jobName'),
	job_ref: jsonb('job_ref'),
	name: text('name'),
	occupation: text('occupation'),
	phone_number: text('phone_number'),
	photo_url: text('photo_url'),
	professionalExperience: text('professionalExperience'),
	score: text('score'),
	state: text('state'),
	city: text('city'),
	carrerLevel: text('carrerLevel'),
	typeInterview: text('typeInterview'),
	user_ref: jsonb('user_ref'),
	academic: text('academic'),
})

// ─── ShortLinks ──────────────────────────────────────────────────────────────

export const shortLinks = pgTable(
	'short_links',
	{
		id: text('id').primaryKey(), // the short code
		jobId: text('jobId'),
		companyId: text('companyId'),
		code: text('code'),
		originalUrl: text('originalUrl'),
		clickCount: integer('clickCount').default(0),
		lastClickedAt: timestamp('lastClickedAt', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		jobCompanyIdx: index('short_links_job_company_idx').on(t.jobId, t.companyId),
	}),
)

// ─── CandidateProfiles ──────────────────────────────────────────────────────
// Currículo vivo do candidato — fonte de verdade do perfil. Escalares em
// coluna (filtráveis) e as listas do currículo em JSONB, que crescem sem
// migration a cada fonte nova (upload de CV, LinkedIn).

export const candidateProfiles = pgTable(
	'candidate_profiles',
	{
		id: text('id').primaryKey(), // = user id
		name: text('name'),
		email: text('email'),
		phone: text('phone'),
		photoUrl: text('photoUrl'),
		/** CPF opcional — PII; fonte da verdade de identidade é `pessoas`. */
		cpf: text('cpf'),
		headline: text('headline'),
		summary: text('summary'),
		occupation: text('occupation'),
		level: text('level'),
		yearsOfExperience: integer('yearsOfExperience'),
		professionalObjectives: text('professionalObjectives'),
		company: text('company'),
		location: text('location'),
		countryOfResidence: text('countryOfResidence'),
		countriesOfInterest: text('countriesOfInterest').array(),
		skills: text('skills').array(),
		experiences: jsonb('experiences'),
		education: jsonb('education'),
		languages: jsonb('languages'),
		certifications: jsonb('certifications'),
		resumeUrl: text('resumeUrl'),
		linkedinUrl: text('linkedinUrl'),
		completeness: integer('completeness'),
		fieldSources: jsonb('fieldSources'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		occupationIdx: index('candidate_profiles_occupation_idx').on(t.occupation),
		countryIdx: index('candidate_profiles_country_idx').on(t.countryOfResidence),
	}),
)

// ─── InterviewHandoffs ──────────────────────────────────────────────────────
// Ticket de uso único pra abrir a entrevista já autenticado a partir de um
// canal externo (plugin ChatGPT/Claude). Vida curta; `usedAt` queima o código.

export const interviewHandoffs = pgTable(
	'interview_handoffs',
	{
		id: text('id').primaryKey(), // o código opaco
		userId: text('userId').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
		usedAt: timestamp('usedAt', { withTimezone: true }),
	},
	(t) => ({
		expiresIdx: index('interview_handoffs_expires_idx').on(t.expiresAt),
	}),
)

// ─── OtsAttestations ────────────────────────────────────────────────────────
// Emissões de attestation OTS 0.2. O documento (JWS) fica guardado pro dono
// re-baixar; a linha é a fonte da revogação consultada pelo statusUrl.

export const otsAttestations = pgTable(
	'ots_attestations',
	{
		id: text('id').primaryKey(), // o jti do JWS
		userId: text('userId').notNull(),
		jobAppliedId: text('jobAppliedId').notNull(),
		companyId: text('companyId'),
		jobId: text('jobId'),
		tier: text('tier').notNull(),
		kid: text('kid').notNull(),
		jws: text('jws').notNull(),
		issuedAt: timestamp('issuedAt', { withTimezone: true }).notNull(),
		expiresAt: timestamp('expiresAt', { withTimezone: true }),
		revokedAt: timestamp('revokedAt', { withTimezone: true }),
	},
	(t) => ({
		userIdx: index('ots_attestations_user_idx').on(t.userId),
	}),
)

// ─── HiringManagerReviewTokens ──────────────────────────────────────────────
// Convite opaco (uso único no resgate) + accessCode pra sessão do HM até expiry.

export const hmReviewTokens = pgTable(
	'hm_review_tokens',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId').notNull(),
		jobId: text('jobId').notNull(),
		jobAppliedIds: jsonb('jobAppliedIds').$type<string[]>().notNull(),
		createdByUserId: text('createdByUserId'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
		usedAt: timestamp('usedAt', { withTimezone: true }),
		accessCode: text('accessCode'),
		accessExpiresAt: timestamp('accessExpiresAt', { withTimezone: true }),
	},
	(t) => ({
		expiresIdx: index('hm_review_tokens_expires_idx').on(t.expiresAt),
		accessCodeIdx: index('hm_review_tokens_access_code_idx').on(t.accessCode),
		companyJobIdx: index('hm_review_tokens_company_job_idx').on(t.companyId, t.jobId),
	}),
)

// ─── SharedCandidateLinks ───────────────────────────────────────────────────

export const sharedCandidateLinks = pgTable(
	'shared_candidate_links',
	{
		id: text('id').primaryKey(), // the share code
		code: text('code').notNull(),
		companyId: text('companyId').notNull(),
		jobId: text('jobId').notNull(),
		candidateIds: jsonb('candidateIds').notNull(),
		sections: jsonb('sections').notNull(),
		createdBy: text('createdBy'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		expiresAt: timestamp('expiresAt', { withTimezone: true }),
		revoked: boolean('revoked').default(false),
	},
	(t) => ({
		companyJobIdx: index('shared_candidate_links_company_job_idx').on(t.companyId, t.jobId),
	}),
)

// ─── ConversationContexts ────────────────────────────────────────────────────

export const conversationContexts = pgTable(
	'conversation_contexts',
	{
		id: text('id').primaryKey(), // composite: phone_jobId
		phone: text('phone').notNull(),
		jobId: text('jobId'),
		companyId: text('companyId'),
		interviewId: text('interviewId'),
		step: text('step'),
		status: text('status'),
		email: text('email'),
		password: text('password'),
		currentQuestionId: text('currentQuestionId'),
		lastMessage: text('lastMessage'),
		retryCount: integer('retryCount').default(0),
		maxRetries: integer('maxRetries').default(3),
		language: text('language'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		phoneIdx: index('conversation_contexts_phone_idx').on(t.phone),
		phoneJobIdx: index('conversation_contexts_phone_job_idx').on(t.phone, t.jobId),
	}),
)

// ─── GupyIntegrations ───────────────────────────────────────────────────────

export const gupyIntegrations = pgTable(
	'gupy_integrations',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId'),
		companyName: text('companyName'),
		gupyApiToken: text('gupyApiToken'),
		emailHtmlTemplate: text('emailHtmlTemplate'),
		interviewBaseUrl: text('interviewBaseUrl'),
		stepName: text('stepName'),
		sentTagName: text('sentTagName'),
		sentTagColor: text('sentTagColor'),
		scoreTagPrefix: text('scoreTagPrefix'),
		scoreTagColor: text('scoreTagColor'),
		techTestFieldLabel: text('techTestFieldLabel'),
		techTestFieldValue: text('techTestFieldValue'),
		careerLevelFieldLabel: text('careerLevelFieldLabel'),
		defaultCareerLevel: text('defaultCareerLevel'),
		defaultLanguage: text('defaultLanguage'),
		questionCount: integer('questionCount'),
		sendCommentOnFinish: boolean('sendCommentOnFinish').default(false),
		commentTemplate: text('commentTemplate'),
		sendCandidateEmail: boolean('sendCandidateEmail').default(true),
		syncLookbackDays: integer('syncLookbackDays').default(9),
		autoSyncOnFinish: boolean('autoSyncOnFinish').default(true),
		enabled: boolean('enabled').default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('gupy_integrations_company_idx').on(t.companyId),
	}),
)

// ─── ResultWebhooks ─────────────────────────────────────────────────────────

export const resultWebhooks = pgTable(
	'result_webhooks',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId').notNull(),
		name: text('name').notNull(),
		url: text('url').notNull(),
		method: text('method').notNull().default('POST'),
		headers: jsonb('headers'),
		/** Tipos de domain event assinados (V2-504). NULL = só interview.finished. */
		events: jsonb('events'),
		approvalThreshold: numeric('approvalThreshold'),
		onlyOnApproval: boolean('onlyOnApproval').default(false),
		enabled: boolean('enabled').default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('result_webhooks_company_idx').on(t.companyId),
	}),
)

// ─── WebhookDeliveryLogs ────────────────────────────────────────────────────

export const webhookDeliveryLogs = pgTable(
	'webhook_delivery_logs',
	{
		id: text('id').primaryKey(),
		webhookId: text('webhookId').notNull(),
		companyId: text('companyId').notNull(),
		event: text('event').notNull(),
		url: text('url').notNull(),
		method: text('method').notNull(),
		requestHeaders: jsonb('requestHeaders'),
		requestBody: jsonb('requestBody'),
		statusCode: integer('statusCode'),
		responseBody: text('responseBody'),
		success: boolean('success').notNull(),
		errorMessage: text('errorMessage'),
		durationMs: integer('durationMs'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('webhook_delivery_logs_company_idx').on(t.companyId),
		webhookIdx: index('webhook_delivery_logs_webhook_idx').on(t.webhookId),
	}),
)

// ─── GlobalSettings (singleton) ─────────────────────────────────────────────

export const globalSettings = pgTable('global_settings', {
	id: text('id').primaryKey(),
	errorAlertRecipients: jsonb('errorAlertRecipients'),
	// transporte de e-mail da instalação (tela Servidor, edição open)
	smtp: jsonb('smtp'),
	// licença do plugin Motor (tela Servidor, edição open) — migration 0047
	motorPlugin: jsonb('motorPlugin'),
	updatedAt: timestamp('updatedAt', { withTimezone: true }),
	updatedBy: text('updatedBy'),
})


// ─── ErrorEvents ────────────────────────────────────────────────────────────

export const errorEvents = pgTable(
	'error_events',
	{
		id: text('id').primaryKey(),
		service: text('service').notNull(),
		failurePoint: text('failurePoint').notNull(),
		interviewId: text('interviewId'),
		userId: text('userId'),
		candidateName: text('candidateName'),
		jobName: text('jobName'),
		companyId: text('companyId'),
		companyName: text('companyName'),
		questionId: text('questionId'),
		method: text('method'),
		retryCount: integer('retryCount'),
		errorMessage: text('errorMessage'),
		errorStack: text('errorStack'),
		extra: jsonb('extra'),
		resolved: boolean('resolved').notNull().default(false),
		resolvedAt: timestamp('resolvedAt', { withTimezone: true }),
		resolvedBy: text('resolvedBy'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('error_events_company_idx').on(t.companyId),
		interviewIdx: index('error_events_interview_idx').on(t.interviewId),
		resolvedIdx: index('error_events_resolved_idx').on(t.resolved),
	}),
)

// ─── AI Usage ────────────────────────────────────────────────────────────────

export const aiUsageEvents = pgTable(
	'ai_usage_events',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId').notNull(),
		companyName: text('companyName'),
		occurredAt: text('occurredAt').notNull(),
		occurredDate: text('occurredDate').notNull(),
		occurredMonth: text('occurredMonth').notNull(),
		source: text('source').notNull(),
		surface: text('surface').notNull(),
		provider: text('provider').notNull(),
		model: text('model').notNull(),
		promptTokens: integer('promptTokens'),
		cachedPromptTokens: integer('cachedPromptTokens'),
		completionTokens: integer('completionTokens'),
		totalTokens: integer('totalTokens'),
		audioSeconds: integer('audioSeconds'),
		estimatedCostMicroUsd: integer('estimatedCostMicroUsd'),
		requestId: text('requestId'),
		jobAppliedId: text('jobAppliedId'),
		postJobId: text('postJobId'),
		userId: text('userId'),
		metadata: jsonb('metadata'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyMonthIdx: index('ai_usage_events_company_month_idx').on(t.companyId, t.occurredMonth),
		monthIdx: index('ai_usage_events_month_idx').on(t.occurredMonth),
		occurredAtIdx: index('ai_usage_events_occurred_at_idx').on(t.occurredAt),
	}),
)

// ─── BillingHistory ──────────────────────────────────────────────────────────

export const billingHistory = pgTable(
	'billing_history',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId'),
		type: text('type'),
		data: jsonb('data'),
		timestamp: integer('timestamp'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyIdx: index('billing_history_company_idx').on(t.companyId),
		timestampIdx: index('billing_history_timestamp_idx').on(t.timestamp),
	}),
)

// ─── Talent OS Credits (F0.3) ────────────────────────────────────────────────
// Wallet + ledger append-only + reservas + catálogo. Isolado do créditos SaaS legado.
// Migration SQL: db/migrations/0016_talent_credits.sql.

export const talentCreditCatalog = pgTable(
	'talent_credit_catalog',
	{
		id: text('id').primaryKey(),
		code: text('code').notNull(),
		name: text('name').notNull(),
		description: text('description'),
		unitCostCredits: integer('unitCostCredits'),
		active: boolean('active').default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		codeIdx: uniqueIndex('talent_credit_catalog_code_idx').on(t.code),
	}),
)

export const talentCreditWallets = pgTable(
	'talent_credit_wallets',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId').notNull(),
		/** '' = wallet raiz do tenant */
		budgetKey: text('budgetKey').notNull().default(''),
		balanceAvailable: integer('balanceAvailable').notNull().default(0),
		balanceReserved: integer('balanceReserved').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		tenantBudgetIdx: uniqueIndex('talent_credit_wallets_tenant_budget_idx').on(
			t.companyId,
			t.budgetKey,
		),
		companyIdx: index('talent_credit_wallets_company_idx').on(t.companyId),
	}),
)

export const talentCreditReservations = pgTable(
	'talent_credit_reservations',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId').notNull(),
		walletId: text('walletId').notNull(),
		catalogCode: text('catalogCode').notNull(),
		amount: integer('amount').notNull(),
		status: text('status').notNull(),
		idempotencyKey: text('idempotencyKey').notNull(),
		objectRef: text('objectRef'),
		budgetKey: text('budgetKey').notNull().default(''),
		expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
		capturedAt: timestamp('capturedAt', { withTimezone: true }),
		releasedAt: timestamp('releasedAt', { withTimezone: true }),
		expiredAt: timestamp('expiredAt', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		idempotencyIdx: uniqueIndex('talent_credit_reservations_idempotency_idx').on(
			t.companyId,
			t.idempotencyKey,
		),
		statusExpiresIdx: index('talent_credit_reservations_status_expires_idx').on(
			t.status,
			t.expiresAt,
		),
		walletIdx: index('talent_credit_reservations_wallet_idx').on(t.walletId),
	}),
)

export const talentCreditLedger = pgTable(
	'talent_credit_ledger',
	{
		id: text('id').primaryKey(),
		companyId: text('companyId').notNull(),
		walletId: text('walletId').notNull(),
		kind: text('kind').notNull(),
		amount: integer('amount').notNull(),
		balanceAvailableAfter: integer('balanceAvailableAfter').notNull(),
		balanceReservedAfter: integer('balanceReservedAfter').notNull(),
		catalogCode: text('catalogCode'),
		reservationId: text('reservationId'),
		objectRef: text('objectRef'),
		idempotencyKey: text('idempotencyKey'),
		meta: jsonb('meta'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		companyCreatedIdx: index('talent_credit_ledger_company_created_idx').on(
			t.companyId,
			t.createdAt,
		),
		walletIdx: index('talent_credit_ledger_wallet_idx').on(t.walletId),
	}),
)

// ─── Talent OS Identity (F0.2) ───────────────────────────────────────────────
// Pessoa/CPF global, aditiva aos cadastros atuais. Migration SQL: 0017_pessoa.sql.

export const pessoas = pgTable(
	'pessoas',
	{
		id: text('id').primaryKey(),
		cpfNormalized: text('cpfNormalized').notNull(),
		displayName: text('displayName'),
		roles: text('roles').array().notNull().default([]),
		linkedUserIds: text('linkedUserIds').array().notNull().default([]),
		linkedUsersCompanyIds: text('linkedUsersCompanyIds').array().notNull().default([]),
		linkedCandidateProfileIds: text('linkedCandidateProfileIds').array().notNull().default([]),
		mergedIntoPessoaId: text('mergedIntoPessoaId'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		cpfIdx: uniqueIndex('pessoas_cpf_normalized_idx').on(t.cpfNormalized),
		mergedIdx: index('pessoas_merged_into_idx').on(t.mergedIntoPessoaId),
	}),
)

export const pessoaLinks = pgTable(
	'pessoa_links',
	{
		id: text('id').primaryKey(),
		pessoaId: text('pessoaId').notNull(),
		type: text('type').notNull(),
		userId: text('userId'),
		usersCompanyId: text('usersCompanyId'),
		candidateProfileId: text('candidateProfileId'),
		targetId: text('targetId').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		pessoaIdx: index('pessoa_links_pessoa_idx').on(t.pessoaId),
		targetIdx: uniqueIndex('pessoa_links_target_idx').on(t.type, t.targetId),
		pessoaTargetIdx: uniqueIndex('pessoa_links_pessoa_target_idx').on(
			t.pessoaId,
			t.type,
			t.targetId,
		),
	}),
)

// ─── Domain Events Outbox (Talent OS F0.6) ───────────────────────────────────

export const domainEventsOutbox = pgTable(
	'domain_events_outbox',
	{
		id: text('id').primaryKey(),
		type: text('type').notNull(),
		schemaVersion: text('schemaVersion').notNull(),
		companyId: text('companyId').notNull(),
		payload: jsonb('payload').notNull(),
		status: text('status').notNull().default('pending'),
		retryCount: integer('retryCount').notNull().default(0),
		lastError: text('lastError'),
		publishedAt: timestamp('publishedAt', { withTimezone: true }),
		failedAt: timestamp('failedAt', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => ({
		statusCreatedIdx: index('domain_events_outbox_status_created_idx').on(
			t.status,
			t.createdAt,
		),
		companyCreatedIdx: index('domain_events_outbox_company_created_idx').on(
			t.companyId,
			t.createdAt,
		),
	}),
)

// ─── Relations (for Drizzle relational queries with `with`) ─────────────────

export const jobsAppliedRelations = relations(jobsApplied, ({ one, many }) => ({
	interviewResult: one(interviewResults, {
		fields: [jobsApplied.id],
		references: [interviewResults.job_applied_id],
	}),
	avaliacaoFinal: one(avaliacaoFinal, {
		fields: [jobsApplied.id],
		references: [avaliacaoFinal.job_applied_id],
	}),
	batchProcessing: one(batchProcessing, {
		fields: [jobsApplied.id],
		references: [batchProcessing.job_applied_id],
	}),
	exitJobResult: one(exitJobResults, {
		fields: [jobsApplied.id],
		references: [exitJobResults.job_applied_id],
	}),
	answers: many(interviewAnswers),
	additionalAnswers: many(additionalAnswers),
}))

export const interviewAnswersRelations = relations(interviewAnswers, ({ one }) => ({
	jobApplied: one(jobsApplied, {
		fields: [interviewAnswers.job_applied_id],
		references: [jobsApplied.id],
	}),
}))

export const additionalAnswersRelations = relations(additionalAnswers, ({ one }) => ({
	jobApplied: one(jobsApplied, {
		fields: [additionalAnswers.job_applied_id],
		references: [jobsApplied.id],
	}),
}))

export const postJobsRelations = relations(postJobs, ({ many }) => ({
	questions: many(postJobQuestions),
	additionalQuestions: many(postJobAdditionalQuestions),
}))

export const postJobQuestionsRelations = relations(postJobQuestions, ({ one }) => ({
	postJob: one(postJobs, {
		fields: [postJobQuestions.post_job_id],
		references: [postJobs.id],
	}),
}))

export const postJobAdditionalQuestionsRelations = relations(postJobAdditionalQuestions, ({ one }) => ({
	postJob: one(postJobs, {
		fields: [postJobAdditionalQuestions.post_job_id],
		references: [postJobs.id],
	}),
}))
