import { asc, eq, sql } from 'drizzle-orm'

import type { DrizzleDb } from './client'
import { infraMigrations } from './schema/documents'

const NORMALIZED_SCHEMA_SQL = `
-- ═══════════════════════════════════════════════════════════════════════════
-- BetterAuth tables
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auth_user (
	id text PRIMARY KEY,
	name text NOT NULL,
	email text NOT NULL,
	email_verified boolean NOT NULL DEFAULT false,
	image text,
	phone_number text,
	banned boolean,
	ban_reason text,
	ban_expires timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_user_email_idx ON auth_user (email);
CREATE INDEX IF NOT EXISTS auth_user_phone_idx ON auth_user (phone_number);

CREATE TABLE IF NOT EXISTS session (
	id text PRIMARY KEY,
	expires_at timestamptz NOT NULL,
	token text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	ip_address text,
	user_agent text,
	user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
	active_organization_id text
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_session_token_idx ON session (token);
CREATE INDEX IF NOT EXISTS auth_session_user_id_idx ON session (user_id);

CREATE TABLE IF NOT EXISTS account (
	id text PRIMARY KEY,
	account_id text NOT NULL,
	provider_id text NOT NULL,
	user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
	access_token text,
	refresh_token text,
	id_token text,
	access_token_expires_at timestamptz,
	refresh_token_expires_at timestamptz,
	scope text,
	password text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_account_provider_account_idx ON account (provider_id, account_id);
CREATE INDEX IF NOT EXISTS auth_account_user_id_idx ON account (user_id);

CREATE TABLE IF NOT EXISTS verification (
	id text PRIMARY KEY,
	identifier text NOT NULL,
	value text NOT NULL,
	expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_verification_identifier_idx ON verification (identifier);
CREATE INDEX IF NOT EXISTS auth_verification_value_idx ON verification (value);

CREATE TABLE IF NOT EXISTS jwks (
	id text PRIMARY KEY,
	public_key text NOT NULL,
	private_key text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS auth_jwks_created_at_idx ON jwks (created_at);
CREATE INDEX IF NOT EXISTS auth_jwks_expires_at_idx ON jwks (expires_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- Application tables — 100% relational, zero JSONB
-- Column names preserve the original Firestore-era naming convention
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS companies (
	id text PRIMARY KEY,
	"companyName" text,
	"companyBio" text,
	"companLogo" text,
	"companyCity" text,
	"companyCountry" text,
	"companyState" text,
	"companySize" text,
	"companyWebsite" text,
	"companyId" text,
	segment text,
	"ownerUserCompanyId" text,
	"subscriptionPlan" text,
	"subscriptionStatus" text,
	"subscriptionId" text,
	"stripeCustomerId" text,
	"currentPeriodEnd" integer,
	"trialEnd" integer,
	"subscriptionStartAt" timestamptz,
	"subscriptionEndAt" timestamptz,
	"creditsMonthly" integer DEFAULT 0,
	"creditsCourtesy" integer DEFAULT 0,
	"creditsFixed" integer DEFAULT 0,
	"trialCourtesyCreditsGranted" integer DEFAULT 0,
	"trialGrantedAt" timestamptz,
	"featureUseEngineProcessing" boolean DEFAULT false,
	objective text[],
	"typeInterview" text[],
	"headquartersCountries" text[],
	"notificationsEmail" boolean,
	"notificationReportWeek" boolean,
	"evaluateInternationalCandidates" boolean,
	"whatsappBetaAccess" boolean,
	retro2025 text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_name_idx ON companies ("companyName");

CREATE TABLE IF NOT EXISTS users (
	id text PRIMARY KEY,
	uuid text,
	display_name text,
	email text,
	phone_number text,
	photo_url text,
	language text,
	"countryOfResidence" text,
	"countriesOfInterest" text[],
	"professionalObjectives" text,
	"resumeUrl" text,
	occupation text,
	level text,
	state text,
	city text,
	external_id text,
	"professionalExperience" text,
	"stripeCustomerId" text,
	"paymentPaid" boolean,
	"paymentPaidDate" timestamptz,
	"paymentMessageError" text,
	"paymentDateError" timestamptz,
	"dreamJobId" text,
	"dreamJobAppliedId" text,
	"dreamJobCreatedAt" timestamptz,
	"dreamJobStatus" text,
	"dreamJobCompletedAt" timestamptz,
	"dreamJobGeneralFeedback" text,
	created_time timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE TABLE IF NOT EXISTS users_company (
	id text PRIMARY KEY,
	uuid text,
	company_id text REFERENCES companies(id),
	display_name text,
	email text,
	first_name text,
	last_name text,
	occupation text,
	phone_number text,
	photo_url text,
	is_owner boolean,
	access_level text,
	created_time timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_company_email_idx ON users_company (email);
CREATE INDEX IF NOT EXISTS users_company_company_idx ON users_company (company_id);

ALTER TABLE companies
	ADD CONSTRAINT companies_owner_user_company_fk
	FOREIGN KEY ("ownerUserCompanyId") REFERENCES users_company(id);

CREATE TABLE IF NOT EXISTS user_company_interview_tags (
	id text PRIMARY KEY,
	user_company_id text NOT NULL REFERENCES users_company(id) ON DELETE CASCADE,
	"interviewId" text,
	"jobName" text,
	"tagCreatedAt" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ucit_user_company_idx ON user_company_interview_tags (user_company_id);

CREATE TABLE IF NOT EXISTS user_company_tag_hard_skills (
	id text PRIMARY KEY,
	tag_id text NOT NULL REFERENCES user_company_interview_tags(id) ON DELETE CASCADE,
	categoria text,
	tag text,
	area text,
	pontuacao numeric,
	nivel_evidencia text,
	evidencia text,
	contexto_uso text,
	palavras_chave text[],
	tempo_experiencia text,
	necessita_validacao boolean,
	sort_order integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ucths_tag_idx ON user_company_tag_hard_skills (tag_id);

CREATE TABLE IF NOT EXISTS user_company_tag_soft_skills (
	id text PRIMARY KEY,
	tag_id text NOT NULL REFERENCES user_company_interview_tags(id) ON DELETE CASCADE,
	categoria text,
	tag text,
	pontuacao numeric,
	nivel_evidencia text,
	evidencia text,
	sort_order integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS uctss_tag_idx ON user_company_tag_soft_skills (tag_id);

CREATE TABLE IF NOT EXISTS user_company_tag_analysis (
	id text PRIMARY KEY,
	tag_id text NOT NULL UNIQUE REFERENCES user_company_interview_tags(id) ON DELETE CASCADE,
	senioridade_nivel text,
	senioridade_score numeric,
	senioridade_evidencias text[],
	market_fit_score numeric,
	market_fit_analise text,
	classificacao_perfil text,
	classificacao_score numeric,
	gaps_identificados text[],
	gaps_recomendacoes text[],
	resumo_executivo text
);
CREATE UNIQUE INDEX IF NOT EXISTS ucta_tag_idx ON user_company_tag_analysis (tag_id);

CREATE TABLE IF NOT EXISTS info_jobs (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	name text,
	"finishText" text,
	"finishVideo" text,
	"welcomeText" text,
	"welcomeVideo" text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS info_jobs_company_idx ON info_jobs (company_id);

CREATE TABLE IF NOT EXISTS notification_messages (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	name text,
	content text,
	type text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_messages_company_idx ON notification_messages (company_id);

CREATE TABLE IF NOT EXISTS post_jobs (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	"jobId" text,
	"jobName" text,
	identifier text,
	"jobDescription" text,
	"employmentType" text,
	"carrerLevel" text,
	language text,
	"typeInterview" text,
	"interviewMode" text,
	"jobResponsabilities" text,
	"jobResponsibilities" text,
	"jobRequirements" text,
	"structuredRequirements" jsonb,
	"knockoutTree" jsonb,
	"jobCategories" text,
	"jobModel" text,
	"jobHours" text,
	"companyName" text,
	"creatorId" text,
	"creatorName" text,
	"creatorEmail" text,
	"contractType" text,
	"screeningObjective" text,
	"workModality" text,
	"mainSkills" text,
	"generatedJobDescription" text,
	"limitNumberJobVacancies" text,
	stopped boolean,
	archived boolean,
	public boolean,
	priority boolean NOT NULL DEFAULT false,
	"limitedJobVacancy" boolean,
	"infoJobsBool" boolean,
	"requiresPreviousExperience" boolean,
	"minimumAge" integer,
	"addressState" text,
	"addressCountry" text,
	"addressCity" text,
	"educationalRequiements" text[],
	"jdMetaCompanyDescription" text,
	"jdMetaContractType" text,
	"jdMetaBenefits" text,
	"jdMetaSalary" text,
	"jdMetaGeneratedAt" timestamptz,
	"jdMetaGeneratedBy" text,
	"creatorUserCompanyId" text REFERENCES users_company(id),
	"infoJobId" text REFERENCES info_jobs(id),
	"notificationMessageId" text REFERENCES notification_messages(id),
	"timeCreated" timestamptz,
	"closingDate" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_jobs_company_idx ON post_jobs (company_id);
CREATE INDEX IF NOT EXISTS post_jobs_time_created_idx ON post_jobs ("timeCreated");

CREATE TABLE IF NOT EXISTS post_job_questions (
	id text NOT NULL,
	post_job_id text NOT NULL REFERENCES post_jobs(id) ON DELETE CASCADE,
	question text,
	"audioUrl" text,
	level text,
	peso numeric,
	skills text,
	finish boolean,
	sort_order integer DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (post_job_id, id)
);
CREATE INDEX IF NOT EXISTS post_job_questions_post_job_idx ON post_job_questions (post_job_id);

CREATE TABLE IF NOT EXISTS post_job_additional_questions (
	id text NOT NULL,
	post_job_id text NOT NULL REFERENCES post_jobs(id) ON DELETE CASCADE,
	question text,
	"audioUrl" text,
	level text,
	peso numeric,
	skills text,
	finish boolean,
	sort_order integer DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (post_job_id, id)
);
CREATE INDEX IF NOT EXISTS post_job_additional_questions_post_job_idx ON post_job_additional_questions (post_job_id);

CREATE TABLE IF NOT EXISTS jobs_applied (
	id text PRIMARY KEY,
	user_id text NOT NULL REFERENCES users(id),
	post_job_id text REFERENCES post_jobs(id),
	company_id text REFERENCES companies(id),
	finished boolean DEFAULT false,
	"candidateStatus" text,
	"isPracticing" boolean,
	"engineBatchId" text,
	"engineBatchStatus" text,
	"typeInterview" text,
	"appliedTime" timestamptz,
	"finishedTime" timestamptz,
	"dateSelect" timestamptz,
	"rejectionReasonCode" text,
	"rejectionReasonLabel" text,
	"rejectionNote" text,
	"rejectionFeedbackSentAt" timestamptz,
	"rejectionDecisionSource" text,
	"rejectionDecidedByUserId" text,
	"rejectionTaxonomyVersion" text,
	"rejectionEvidence" text,
	"rejectionRiskFlags" text[],
	"screeningKnockoutAnswers" jsonb,
	"screeningKnockoutResult" jsonb,
	"screeningKnockoutTreeSnapshot" jsonb,
	"whatsappFeedbackGeral" text,
	"whatsappPorcentagemMatch" numeric,
	"whatsappRecomendacao" text,
	"whatsappRequisitosAtendidos" text[],
	"whatsappRequisitosNaoAtendidos" text[],
	"whatsappPontosAtencao" text[],
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_applied_user_idx ON jobs_applied (user_id);
CREATE INDEX IF NOT EXISTS jobs_applied_company_idx ON jobs_applied (company_id);
CREATE INDEX IF NOT EXISTS jobs_applied_post_job_idx ON jobs_applied (post_job_id);
CREATE INDEX IF NOT EXISTS jobs_applied_finished_idx ON jobs_applied (finished);

CREATE TABLE IF NOT EXISTS rejection_review_requests (
	id text PRIMARY KEY,
	"companyId" text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	"jobId" text NOT NULL REFERENCES post_jobs(id) ON DELETE CASCADE,
	"jobAppliedId" text NOT NULL UNIQUE REFERENCES jobs_applied(id) ON DELETE CASCADE,
	"candidateUserId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	status text NOT NULL,
	"requestedAt" timestamptz NOT NULL,
	"candidateMessage" text,
	"reviewedByUserId" text,
	"reviewedAt" timestamptz,
	"reviewerNote" text,
	"outcomeMessage" text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rejection_review_requests_job_applied_idx ON rejection_review_requests ("jobAppliedId");
CREATE INDEX IF NOT EXISTS rejection_review_requests_company_status_requested_idx ON rejection_review_requests ("companyId", status, "requestedAt");

CREATE TABLE IF NOT EXISTS exit_job_results (
	id text PRIMARY KEY,
	job_applied_id text NOT NULL UNIQUE REFERENCES jobs_applied(id) ON DELETE CASCADE,
	"feedbackGeral" text,
	"porcentagemMatch" numeric,
	recomendacao text,
	"pontosFortes" text[],
	"pontosAtencao" text[],
	"areasMelhoria" text[],
	score numeric,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_answers (
	id text NOT NULL,
	job_applied_id text NOT NULL REFERENCES jobs_applied(id) ON DELETE CASCADE,
	question text,
	answer text,
	"captionSegments" jsonb,
	"captionTranslations" jsonb,
	finished boolean DEFAULT false,
	video text,
	audio text,
	skills text,
	score numeric,
	feedback text,
	"analyze" text,
	"qRecomendation" text,
	transcription_status text,
	pulou_a_pergunta boolean,
	improvement text[],
	strengths text[],
	metricas_decisao text,
	qualidade_profundidade numeric,
	qualidade_estruturacao numeric,
	qualidade_exemplificacao numeric,
	senioridade_alinhamento_nivel numeric,
	senioridade_gap_proximo_nivel numeric,
	avaliacao_score numeric,
	avaliacao_recomendacao text,
	avaliacao_motivo_revisao text,
	avaliacao_precisa_revisao boolean,
	avaliacao_sugestoes_melhoria text[],
	sort_order integer DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (job_applied_id, id)
);
CREATE INDEX IF NOT EXISTS interview_answers_job_applied_idx ON interview_answers (job_applied_id);

CREATE TABLE IF NOT EXISTS answer_competencias (
	id text PRIMARY KEY,
	job_applied_id text NOT NULL,
	answer_id text NOT NULL,
	source text NOT NULL,
	type text NOT NULL,
	nome text,
	pontuacao numeric,
	score numeric,
	pontos_fortes text[],
	pontos_desenvolvimento text[],
	sort_order integer DEFAULT 0,
	FOREIGN KEY (job_applied_id, answer_id) REFERENCES interview_answers(job_applied_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS answer_competencias_answer_idx ON answer_competencias (job_applied_id, answer_id);

CREATE TABLE IF NOT EXISTS answer_expectativas (
	id text PRIMARY KEY,
	job_applied_id text NOT NULL,
	answer_id text NOT NULL,
	source text NOT NULL,
	nome text,
	nivel_atendimento numeric,
	evidencias text[],
	gaps text[],
	sort_order integer DEFAULT 0,
	FOREIGN KEY (job_applied_id, answer_id) REFERENCES interview_answers(job_applied_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS answer_expectativas_answer_idx ON answer_expectativas (job_applied_id, answer_id);

CREATE TABLE IF NOT EXISTS additional_answers (
	id text NOT NULL,
	job_applied_id text NOT NULL REFERENCES jobs_applied(id) ON DELETE CASCADE,
	question text,
	answer text,
	finished boolean DEFAULT false,
	video text,
	audio text,
	sort_order integer DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (job_applied_id, id)
);
CREATE INDEX IF NOT EXISTS additional_answers_job_applied_idx ON additional_answers (job_applied_id);

CREATE TABLE IF NOT EXISTS interview_results (
	id text PRIMARY KEY,
	job_applied_id text NOT NULL UNIQUE REFERENCES jobs_applied(id) ON DELETE CASCADE,
	"generalFeedback" text,
	recomentation text,
	score text,
	job text,
	leveljob text,
	state boolean,
	scom numeric,
	sres numeric,
	stec numeric,
	aderencia_descricao numeric,
	alinhamento_responsabilidades numeric,
	alinhamento_nivel numeric,
	"totalAderencia" numeric,
	"totalAlinhamentoResponsabilidade" numeric,
	"totalAlinhamentoNivel" numeric,
	"generalStrengths" text[],
	"generalImprovement" text[],
	"translationCache" jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS interview_results_job_applied_idx ON interview_results (job_applied_id);

CREATE TABLE IF NOT EXISTS cheat_detection (
	id text PRIMARY KEY,
	interview_result_id text NOT NULL UNIQUE REFERENCES interview_results(id) ON DELETE CASCADE,
	pontuacao_autenticidade numeric,
	nivel_confianca text,
	parecer_principal text,
	fatores_criticos text[],
	padroes_identificados text[],
	consideracoes_contextuais text[],
	nivel_risco text,
	acoes_sugeridas text[],
	perguntas_validacao text[],
	consideracoes_eticas text[],
	confiabilidade_analise numeric,
	limitacoes_aplicaveis text[],
	versao_prompt text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cheat_detection_result_idx ON cheat_detection (interview_result_id);

CREATE TABLE IF NOT EXISTS cheat_detection_indicators (
	id text PRIMARY KEY,
	cheat_detection_id text NOT NULL REFERENCES cheat_detection(id) ON DELETE CASCADE,
	type text NOT NULL,
	indicador text,
	descricao text,
	score numeric,
	evidencias text[],
	sort_order integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cheat_indicators_cheat_idx ON cheat_detection_indicators (cheat_detection_id);

CREATE TABLE IF NOT EXISTS cheat_detection_responses (
	id text PRIMARY KEY,
	cheat_detection_id text NOT NULL REFERENCES cheat_detection(id) ON DELETE CASCADE,
	answer_id text,
	parecer text,
	score_autenticidade numeric,
	indicadores text[],
	observacoes text[],
	sort_order integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cheat_responses_cheat_idx ON cheat_detection_responses (cheat_detection_id);

CREATE TABLE IF NOT EXISTS avaliacao_final (
	id text PRIMARY KEY,
	job_applied_id text NOT NULL UNIQUE REFERENCES jobs_applied(id) ON DELETE CASCADE,
	"generalFeedback" text,
	"generalRecomendation" text,
	score numeric,
	pontuacao_final numeric,
	nivel text,
	resumo text,
	recomendacoes_pontos_fortes text[],
	recomendacoes_areas_desenvolvimento text[],
	recomendacoes_sugestoes_melhoria text[],
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS avaliacao_final_job_applied_idx ON avaliacao_final (job_applied_id);

CREATE TABLE IF NOT EXISTS avaliacao_competencias (
	id text PRIMARY KEY,
	avaliacao_final_id text NOT NULL REFERENCES avaliacao_final(id) ON DELETE CASCADE,
	type text NOT NULL,
	nome text,
	pontuacao numeric,
	score numeric,
	pontos_fortes text[],
	pontos_desenvolvimento text[],
	sort_order integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS avaliacao_competencias_avaliacao_idx ON avaliacao_competencias (avaliacao_final_id);

CREATE TABLE IF NOT EXISTS avaliacao_expectativas (
	id text PRIMARY KEY,
	avaliacao_final_id text NOT NULL REFERENCES avaliacao_final(id) ON DELETE CASCADE,
	nome text,
	nivel_atendimento numeric,
	evidencias text[],
	gaps text[],
	sort_order integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS avaliacao_expectativas_avaliacao_idx ON avaliacao_expectativas (avaliacao_final_id);

CREATE TABLE IF NOT EXISTS batch_processing (
	id text PRIMARY KEY,
	job_applied_id text NOT NULL UNIQUE REFERENCES jobs_applied(id) ON DELETE CASCADE,
	status text,
	"engineBatchId" text,
	"openaiBatchId" text,
	"openaiFileId" text,
	error text,
	"fastTrackedBy" text,
	"fastTrackedAt" timestamptz,
	"questionsProcessed" integer,
	"totalQuestions" integer,
	"totalTokensUsed" integer,
	"promptTokensUsed" integer,
	"completionTokensUsed" integer,
	"queuedAt" timestamptz,
	"processingStartedAt" timestamptz,
	"completedAt" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS batch_processing_job_applied_idx ON batch_processing (job_applied_id);

CREATE TABLE IF NOT EXISTS candidate_likes (
	id text PRIMARY KEY,
	job_applied_id text NOT NULL REFERENCES jobs_applied(id) ON DELETE CASCADE,
	user_id text,
	name text,
	avatar_url text,
	email text,
	action boolean,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_likes_job_applied_idx ON candidate_likes (job_applied_id);

CREATE TABLE IF NOT EXISTS credits_used (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	"companyOwner" text,
	"debitedFrom" text,
	feature text,
	"userId" text,
	"jobApplied" text,
	"postJobId" text,
	"usedBy" text,
	"usedByName" text,
	source text,
	ip text,
	"userAgent" text,
	"jobName" text,
	"candidateName" text,
	score text,
	"isHunting" boolean,
	"usedAt" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credits_used_company_idx ON credits_used (company_id);
CREATE INDEX IF NOT EXISTS credits_used_feature_idx ON credits_used (feature);
CREATE INDEX IF NOT EXISTS credits_used_user_idx ON credits_used ("userId");

CREATE TABLE IF NOT EXISTS collaborators (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	user_company_id text REFERENCES users_company(id),
	name text,
	email text,
	password text,
	"accessLevel" text,
	status boolean,
	"creationDate" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collaborators_company_idx ON collaborators (company_id);

CREATE TABLE IF NOT EXISTS company_notifications (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	type text,
	"dateTime" timestamptz,
	read boolean,
	"userId" text,
	"jobAppliedId" text,
	"notificationTitle" text,
	"notificationMessage" text,
	"notificationMetadata" text,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_notifications_company_idx ON company_notifications (company_id);
CREATE INDEX IF NOT EXISTS company_notifications_datetime_idx ON company_notifications ("dateTime");

CREATE TABLE IF NOT EXISTS nps (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	"jobId" text,
	"jobName" text,
	"candidateId" text,
	"candidateName" text,
	"candidateEmail" text,
	"jobApplied" text,
	photo_url text,
	"interviewType" text,
	comment text,
	score numeric,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nps_company_idx ON nps (company_id);

CREATE TABLE IF NOT EXISTS subscription_history (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	action text,
	"operationId" text,
	mode text,
	"customerId" text,
	status text,
	plan text,
	"eventId" text,
	"timestamp" integer,
	"detailPreviousStatus" text,
	"detailNewStatus" text,
	"detailCurrentPeriodEnd" integer,
	"detailTrialEnd" integer,
	"detailAmount" numeric,
	"detailCurrency" text,
	"detailReason" text,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_history_company_idx ON subscription_history (company_id);

CREATE TABLE IF NOT EXISTS job_portal (
	id text PRIMARY KEY,
	company_id text REFERENCES companies(id),
	"bannerUrl" text,
	"defaultDomainUrl" text,
	"logoUrl" text,
	"primaryColor" text,
	"textColor" text,
	"isProfileVisible" boolean
);
CREATE INDEX IF NOT EXISTS job_portal_company_idx ON job_portal (company_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_history (
	id text PRIMARY KEY,
	event text,
	"rawPayload" text,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS insights_cache (
	id text PRIMARY KEY,
	company_id text NOT NULL REFERENCES companies(id),
	"companyId" text,
	language text,
	insight text,
	"generatedAt" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insights_cache_company_idx ON insights_cache (company_id);

CREATE TABLE IF NOT EXISTS batches (
	id text PRIMARY KEY,
	type text,
	status text,
	"interviewId" text,
	"userId" text,
	"companyId" text,
	"jobAppliedPath" text,
	"openaiBatchId" text,
	"openaiFileId" text,
	"openaiOutputFileId" text,
	"totalItems" integer,
	"processedItems" integer,
	"totalTokensUsed" integer,
	"promptTokensUsed" integer,
	"completionTokensUsed" integer,
	"processingMode" text,
	"requestedBy" text,
	error text,
	"completedAt" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS batches_status_idx ON batches (status);
CREATE INDEX IF NOT EXISTS batches_interview_idx ON batches ("interviewId");

CREATE TABLE IF NOT EXISTS interview_whatsapp (
	id text PRIMARY KEY,
	"jobId" text,
	"companyId" text,
	"typeInterview" text,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Tabelas que nasceram fora do fluxo de migration (drizzle push direto no
-- deploy). Em bancos existentes já estão lá e o IF NOT EXISTS é no-op; num
-- banco zerado, sem estes CREATEs as migrations 0006 e 0035 quebram no ALTER
-- (relation does not exist). Colunas espelham db/schema/tables.ts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS result_webhooks (
	id text PRIMARY KEY,
	"companyId" text NOT NULL,
	name text NOT NULL,
	url text NOT NULL,
	method text NOT NULL DEFAULT 'POST',
	headers jsonb,
	events jsonb,
	"approvalThreshold" numeric,
	"onlyOnApproval" boolean DEFAULT false,
	enabled boolean DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS result_webhooks_company_idx ON result_webhooks ("companyId");

CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
	id text PRIMARY KEY,
	"webhookId" text NOT NULL,
	"companyId" text NOT NULL,
	event text NOT NULL,
	url text NOT NULL,
	method text NOT NULL,
	"requestHeaders" jsonb,
	"requestBody" jsonb,
	"statusCode" integer,
	"responseBody" text,
	success boolean NOT NULL,
	"errorMessage" text,
	"durationMs" integer,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_delivery_logs_company_idx ON webhook_delivery_logs ("companyId");
CREATE INDEX IF NOT EXISTS webhook_delivery_logs_webhook_idx ON webhook_delivery_logs ("webhookId");

CREATE TABLE IF NOT EXISTS global_settings (
	id text PRIMARY KEY,
	"errorAlertRecipients" jsonb,
	"updatedAt" timestamptz,
	"updatedBy" text
);

CREATE TABLE IF NOT EXISTS error_events (
	id text PRIMARY KEY,
	service text NOT NULL,
	"failurePoint" text NOT NULL,
	"interviewId" text,
	"userId" text,
	"candidateName" text,
	"jobName" text,
	"companyId" text,
	"companyName" text,
	"questionId" text,
	method text,
	"retryCount" integer,
	"errorMessage" text,
	"errorStack" text,
	extra jsonb,
	resolved boolean NOT NULL DEFAULT false,
	"resolvedAt" timestamptz,
	"resolvedBy" text,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS error_events_company_idx ON error_events ("companyId");
CREATE INDEX IF NOT EXISTS error_events_interview_idx ON error_events ("interviewId");
CREATE INDEX IF NOT EXISTS error_events_resolved_idx ON error_events (resolved);

CREATE TABLE IF NOT EXISTS ai_usage_events (
	id text PRIMARY KEY,
	"companyId" text NOT NULL,
	"companyName" text,
	"occurredAt" text NOT NULL,
	"occurredDate" text NOT NULL,
	"occurredMonth" text NOT NULL,
	source text NOT NULL,
	surface text NOT NULL,
	provider text NOT NULL,
	model text NOT NULL,
	"promptTokens" integer,
	"cachedPromptTokens" integer,
	"completionTokens" integer,
	"totalTokens" integer,
	"audioSeconds" integer,
	"estimatedCostMicroUsd" integer,
	"requestId" text,
	"jobAppliedId" text,
	"postJobId" text,
	"userId" text,
	metadata jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_events_company_month_idx ON ai_usage_events ("companyId", "occurredMonth");
CREATE INDEX IF NOT EXISTS ai_usage_events_month_idx ON ai_usage_events ("occurredMonth");
CREATE INDEX IF NOT EXISTS ai_usage_events_occurred_at_idx ON ai_usage_events ("occurredAt");

-- ═══════════════════════════════════════════════════════════════════════════
-- Views
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS company_interviews_view;
CREATE VIEW company_interviews_view AS
SELECT
	ja.id,
	ja.company_id,
	ja.post_job_id,
	ja.user_id,
	ja.finished,
	ja.finished          AS finish,
	ja."candidateStatus",
	ja."appliedTime"     AS date,
	ja."dateSelect",
	ja."rejectionReasonCode",
	ja."rejectionReasonLabel",
	ja."rejectionNote",
	ja."rejectionFeedbackSentAt",
	ja."rejectionDecisionSource",
	ja."rejectionDecidedByUserId",
	ja."rejectionTaxonomyVersion",
	ja."rejectionEvidence",
	ja."rejectionRiskFlags",
	COALESCE(ir.score, '0') AS score,
	u.display_name       AS name,
	u.photo_url,
	u.occupation,
	u.external_id,
	u."professionalExperience",
	u.phone_number,
	u.state,
	u.city,
	u.email,
	pj."carrerLevel",
	pj."jobName",
	pj."jobDescription",
	pj."typeInterview",
	pj.stopped,
	jsonb_build_object(
		'id', ja.id,
		'path', 'users/' || ja.user_id || '/jobsApplied/' || ja.id
	) AS job_applied_ref,
	jsonb_build_object(
		'id', ja.user_id,
		'path', 'users/' || ja.user_id
	) AS user_ref,
	jsonb_build_object(
		'id', ja.post_job_id,
		'path', 'companies/' || ja.company_id || '/postJob/' || ja.post_job_id
	) AS job_ref
FROM jobs_applied ja
LEFT JOIN users u   ON u.id  = ja.user_id
LEFT JOIN post_jobs pj ON pj.id = ja.post_job_id
LEFT JOIN interview_results ir ON ir.job_applied_id = ja.id;

CREATE OR REPLACE VIEW public_interviews AS
SELECT
	ja.id,
	ja.company_id,
	ja."appliedTime"         AS date,
	u.email,
	u.external_id,
	jsonb_build_object(
		'id',   ja.id,
		'path', 'users/' || ja.user_id || '/jobsApplied/' || ja.id
	) AS job_applied_ref,
	pj."jobName",
	jsonb_build_object(
		'id',   ja.post_job_id,
		'path', 'companies/' || ja.company_id || '/postJob/' || ja.post_job_id
	) AS job_ref,
	u.display_name           AS name,
	u.occupation,
	u.phone_number,
	u.photo_url,
	u."professionalExperience",
	COALESCE(ir.score, '0')  AS score,
	u.state,
	u.city,
	pj."carrerLevel",
	pj."typeInterview",
	jsonb_build_object(
		'id',   ja.user_id,
		'path', 'users/' || ja.user_id
	) AS user_ref,
	NULL::text               AS academic
FROM jobs_applied ja
LEFT JOIN users u              ON u.id  = ja.user_id
LEFT JOIN post_jobs pj         ON pj.id = ja.post_job_id
LEFT JOIN interview_results ir ON ir.job_applied_id = ja.id
LEFT JOIN companies c          ON c.id  = ja.company_id
WHERE ja.finished = true
  AND lower(pj."typeInterview") = 'interview'
  AND (c."subscriptionPlan" IS NULL OR lower(c."subscriptionPlan") != 'enterprise');
`

const MIGRATION_0002 = `
CREATE TABLE IF NOT EXISTS short_links (
	id text PRIMARY KEY,
	"jobId" text,
	"companyId" text,
	code text,
	"originalUrl" text,
	"clickCount" integer DEFAULT 0,
	"lastClickedAt" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS short_links_job_company_idx ON short_links ("jobId", "companyId");

CREATE TABLE IF NOT EXISTS conversation_contexts (
	id text PRIMARY KEY,
	phone text NOT NULL,
	"jobId" text,
	"companyId" text,
	"interviewId" text,
	step text,
	status text,
	email text,
	password text,
	"currentQuestionId" text,
	"lastMessage" text,
	"retryCount" integer DEFAULT 0,
	"maxRetries" integer DEFAULT 3,
	language text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_contexts_phone_idx ON conversation_contexts (phone);
CREATE INDEX IF NOT EXISTS conversation_contexts_phone_job_idx ON conversation_contexts (phone, "jobId");

CREATE TABLE IF NOT EXISTS gupy_integrations (
	id text PRIMARY KEY,
	"companyId" text,
	"companyName" text,
	"gupyApiToken" text,
	"emailTemplateId" integer,
	"interviewBaseUrl" text,
	enabled boolean DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gupy_integrations_company_idx ON gupy_integrations ("companyId");

CREATE TABLE IF NOT EXISTS billing_history (
	id text PRIMARY KEY,
	"companyId" text,
	type text,
	data jsonb,
	"timestamp" integer,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_history_company_idx ON billing_history ("companyId");
CREATE INDEX IF NOT EXISTS billing_history_timestamp_idx ON billing_history ("timestamp");
`

const MIGRATION_0003 = `
-- Rename auth table from "user" to auth_user to avoid confusion with application "users" table
ALTER TABLE IF EXISTS "user" RENAME TO auth_user;
`

const MIGRATION_0004 = `
-- Expand gupy_integrations: rename emailTemplateId → emailHtmlTemplate (text)
-- and add all new configurable fields
ALTER TABLE gupy_integrations DROP COLUMN IF EXISTS "emailTemplateId";
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "emailHtmlTemplate" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "stepName" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "sentTagName" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "sentTagColor" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "scoreTagPrefix" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "scoreTagColor" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "techTestFieldLabel" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "techTestFieldValue" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "careerLevelFieldLabel" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "defaultCareerLevel" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "defaultLanguage" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "questionCount" integer;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "sendCommentOnFinish" boolean DEFAULT false;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "commentTemplate" text;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "sendCandidateEmail" boolean DEFAULT true;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "syncLookbackDays" integer DEFAULT 9;
ALTER TABLE gupy_integrations ADD COLUMN IF NOT EXISTS "autoSyncOnFinish" boolean DEFAULT true;
`

const MIGRATION_0005 = `
-- Adiciona campo interviewMode em post_jobs para suportar entrevista por voz conversacional.
-- Valores aceitos: 'video' (default implícito quando NULL), 'voice'.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "interviewMode" text;
`

const MIGRATION_0006 = `
-- AI usage: prompt tokens served from OpenAI prompt cache (50% input pricing).
ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS "cachedPromptTokens" integer;
`

const MIGRATION_0007 = `
-- Adiciona flag binário de prioridade em post_jobs para destacar vagas de foco.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS priority boolean NOT NULL DEFAULT false;
`

const MIGRATION_0008 = `
-- Links de compartilhamento de candidatos com corte de seções server-side.
CREATE TABLE IF NOT EXISTS shared_candidate_links (
	id text PRIMARY KEY,
	code text NOT NULL,
	"companyId" text NOT NULL,
	"jobId" text NOT NULL,
	"candidateIds" jsonb NOT NULL,
	sections jsonb NOT NULL,
	"createdBy" text,
	created_at timestamptz NOT NULL DEFAULT now(),
	"expiresAt" timestamptz,
	revoked boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS shared_candidate_links_company_job_idx ON shared_candidate_links ("companyId", "jobId");
`

const MIGRATION_0009 = `
-- Motivos de abandono de entrevista enviados pelo candidato.
CREATE TABLE IF NOT EXISTS interview_abandonments (
	id text PRIMARY KEY,
	"interviewId" text NOT NULL,
	"jobId" text NOT NULL,
	"companyId" text NOT NULL,
	"userId" text,
	reason text NOT NULL,
	comment text,
	"questionIndex" integer,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interview_abandonments_company_idx ON interview_abandonments ("companyId");
CREATE INDEX IF NOT EXISTS interview_abandonments_job_idx ON interview_abandonments ("jobId");
CREATE INDEX IF NOT EXISTS interview_abandonments_interview_idx ON interview_abandonments ("interviewId");
`

const MIGRATION_0010 = `
-- Avaliação de proficiência de idioma dentro da entrevista técnica.
-- 1) Flag na vaga que liga a avaliação de idioma (default false = sem mudança).
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "evaluateLanguage" boolean DEFAULT false;
-- 2) Resultado por pergunta — campos SEPARADOS dos técnicos, nunca reusados.
ALTER TABLE interview_answers ADD COLUMN IF NOT EXISTS "languageScore" numeric;
ALTER TABLE interview_answers ADD COLUMN IF NOT EXISTS "languageFeedback" text;
ALTER TABLE interview_answers ADD COLUMN IF NOT EXISTS "languageAnalise" text;
-- 3) Bloco final da avaliação de idioma no JobApplied (JSONB: {score,nivel,feedback,analise}).
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "languageEvaluation" jsonb;
`

const MIGRATION_0011 = `
-- Vaga-espelho do fluxo de entrevista de perfil (Dream Jobs): existe só para
-- dar contexto à entrevista do candidato e publicar o resultado no hunting.
-- Listagens de vaga (portal, MCP search_jobs) devem excluir estas.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "profileInterview" boolean DEFAULT false;
`

const MIGRATION_0012 = `
-- Handoff de sessão: ticket opaco de uso único pra abrir a entrevista já
-- autenticado a partir de um canal externo (plugin ChatGPT/Claude).
CREATE TABLE IF NOT EXISTS interview_handoffs (
  id text PRIMARY KEY,
  "userId" text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS interview_handoffs_expires_idx ON interview_handoffs ("expiresAt");
`

const MIGRATION_0013 = `
-- Currículo vivo do candidato: fonte de verdade do perfil, alimentada por
-- chat (plugin), área do candidato, upload de currículo e LinkedIn.
-- Antes disso o adapter selfhosted era no-op: salvava e perdia em silêncio.
CREATE TABLE IF NOT EXISTS candidate_profiles (
  id text PRIMARY KEY,
  name text,
  email text,
  phone text,
  "photoUrl" text,
  headline text,
  summary text,
  occupation text,
  level text,
  "yearsOfExperience" integer,
  "professionalObjectives" text,
  company text,
  location text,
  "countryOfResidence" text,
  "countriesOfInterest" text[],
  skills text[],
  experiences jsonb,
  education jsonb,
  languages jsonb,
  certifications jsonb,
  "resumeUrl" text,
  "linkedinUrl" text,
  completeness integer,
  "fieldSources" jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_profiles_occupation_idx ON candidate_profiles (occupation);
CREATE INDEX IF NOT EXISTS candidate_profiles_country_idx ON candidate_profiles ("countryOfResidence");
`

const MIGRATION_0014 = `
-- Segmentos de legenda retornados pelo Whisper por pergunta de entrevista.
-- JSONB: Array<{ start: number; end: number; text: string }>.
ALTER TABLE interview_answers ADD COLUMN IF NOT EXISTS "captionSegments" jsonb;
`

const MIGRATION_0015 = `
-- Cache de traducoes sob demanda para resultado e legendas.
-- interview_results.translationCache: mapa por idioma do resultado traduzido.
-- interview_answers.captionTranslations: mapa por idioma dos segmentos traduzidos.
ALTER TABLE interview_results ADD COLUMN IF NOT EXISTS "translationCache" jsonb;
ALTER TABLE interview_answers ADD COLUMN IF NOT EXISTS "captionTranslations" jsonb;
`

const MIGRATION_0016 = `
-- Talent OS Credits Service (F0.3): wallet, ledger append-only, reservas e catálogo.
-- Somente CREATE TABLE / INDEX — sem ALTER/DROP em tabelas existentes.
CREATE TABLE IF NOT EXISTS talent_credit_catalog (
	id text PRIMARY KEY,
	code text NOT NULL,
	name text NOT NULL,
	description text,
	"unitCostCredits" integer,
	active boolean DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS talent_credit_catalog_code_idx
	ON talent_credit_catalog (code);

CREATE TABLE IF NOT EXISTS talent_credit_wallets (
	id text PRIMARY KEY,
	"companyId" text NOT NULL,
	"budgetKey" text NOT NULL DEFAULT '',
	"balanceAvailable" integer NOT NULL DEFAULT 0,
	"balanceReserved" integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS talent_credit_wallets_tenant_budget_idx
	ON talent_credit_wallets ("companyId", "budgetKey");
CREATE INDEX IF NOT EXISTS talent_credit_wallets_company_idx
	ON talent_credit_wallets ("companyId");

CREATE TABLE IF NOT EXISTS talent_credit_reservations (
	id text PRIMARY KEY,
	"companyId" text NOT NULL,
	"walletId" text NOT NULL,
	"catalogCode" text NOT NULL,
	amount integer NOT NULL,
	status text NOT NULL,
	"idempotencyKey" text NOT NULL,
	"objectRef" text,
	"budgetKey" text NOT NULL DEFAULT '',
	"expiresAt" timestamptz NOT NULL,
	"capturedAt" timestamptz,
	"releasedAt" timestamptz,
	"expiredAt" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS talent_credit_reservations_idempotency_idx
	ON talent_credit_reservations ("companyId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS talent_credit_reservations_status_expires_idx
	ON talent_credit_reservations (status, "expiresAt");
CREATE INDEX IF NOT EXISTS talent_credit_reservations_wallet_idx
	ON talent_credit_reservations ("walletId");

CREATE TABLE IF NOT EXISTS talent_credit_ledger (
	id text PRIMARY KEY,
	"companyId" text NOT NULL,
	"walletId" text NOT NULL,
	kind text NOT NULL,
	amount integer NOT NULL,
	"balanceAvailableAfter" integer NOT NULL,
	"balanceReservedAfter" integer NOT NULL,
	"catalogCode" text,
	"reservationId" text,
	"objectRef" text,
	"idempotencyKey" text,
	meta jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS talent_credit_ledger_company_created_idx
	ON talent_credit_ledger ("companyId", created_at DESC);
CREATE INDEX IF NOT EXISTS talent_credit_ledger_wallet_idx
	ON talent_credit_ledger ("walletId");
CREATE UNIQUE INDEX IF NOT EXISTS talent_credit_ledger_idempotency_idx
	ON talent_credit_ledger ("companyId", "idempotencyKey")
	WHERE "idempotencyKey" IS NOT NULL;
`

const MIGRATION_0017 = `
-- Talent OS Identity (F0.2): pessoa/CPF global e vínculos assistidos.
-- Somente CREATE TABLE / INDEX — sem ALTER/DROP em tabelas existentes.
CREATE TABLE IF NOT EXISTS pessoas (
	id text PRIMARY KEY,
	"cpfNormalized" text NOT NULL,
	"displayName" text,
	roles text[] NOT NULL DEFAULT '{}',
	"linkedUserIds" text[] NOT NULL DEFAULT '{}',
	"linkedUsersCompanyIds" text[] NOT NULL DEFAULT '{}',
	"linkedCandidateProfileIds" text[] NOT NULL DEFAULT '{}',
	"mergedIntoPessoaId" text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pessoas_cpf_normalized_idx
	ON pessoas ("cpfNormalized");
CREATE INDEX IF NOT EXISTS pessoas_merged_into_idx
	ON pessoas ("mergedIntoPessoaId");

CREATE TABLE IF NOT EXISTS pessoa_links (
	id text PRIMARY KEY,
	"pessoaId" text NOT NULL,
	type text NOT NULL,
	"userId" text,
	"usersCompanyId" text,
	"candidateProfileId" text,
	"targetId" text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pessoa_links_pessoa_idx
	ON pessoa_links ("pessoaId");
CREATE UNIQUE INDEX IF NOT EXISTS pessoa_links_target_idx
	ON pessoa_links (type, "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS pessoa_links_pessoa_target_idx
	ON pessoa_links ("pessoaId", type, "targetId");
`

const MIGRATION_0018 = `
-- Talent OS Event Outbox (F0.6): eventos de dominio replayaveis.
-- Somente CREATE TABLE / INDEX — sem ALTER/DROP em tabelas existentes.
CREATE TABLE IF NOT EXISTS domain_events_outbox (
	id text PRIMARY KEY,
	type text NOT NULL,
	"schemaVersion" text NOT NULL,
	"companyId" text NOT NULL,
	payload jsonb NOT NULL,
	status text NOT NULL DEFAULT 'pending',
	"retryCount" integer NOT NULL DEFAULT 0,
	"lastError" text,
	"publishedAt" timestamptz,
	"failedAt" timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS domain_events_outbox_status_created_idx
	ON domain_events_outbox (status, created_at);
CREATE INDEX IF NOT EXISTS domain_events_outbox_company_created_idx
	ON domain_events_outbox ("companyId", created_at);
`

const MIGRATION_0019 = `
-- Talent OS ATS Core (F2.1): requisitos tipados em PostJob, paralelos ao jobRequirements legado.
-- Campo opcional e aditivo; vagas antigas seguem validas sem backfill.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "structuredRequirements" jsonb;
`

const MIGRATION_0020 = `
-- Talent OS ATS Core (F2.6): motivos estruturados de reprovacao em JobApplied.
-- Campos opcionais e aditivos; candidaturas antigas seguem validas sem backfill.
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionReasonCode" text;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionReasonLabel" text;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionNote" text;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionFeedbackSentAt" timestamptz;

DROP VIEW IF EXISTS company_interviews_view;
CREATE VIEW company_interviews_view AS
SELECT
	ja.id,
	ja.company_id,
	ja.post_job_id,
	ja.user_id,
	ja.finished,
	ja.finished          AS finish,
	ja."candidateStatus",
	ja."appliedTime"     AS date,
	ja."dateSelect",
	ja."rejectionReasonCode",
	ja."rejectionReasonLabel",
	ja."rejectionNote",
	ja."rejectionFeedbackSentAt",
	COALESCE(ir.score, '0') AS score,
	u.display_name       AS name,
	u.photo_url,
	u.occupation,
	u.external_id,
	u."professionalExperience",
	u.phone_number,
	u.state,
	u.city,
	u.email,
	pj."carrerLevel",
	pj."jobName",
	pj."jobDescription",
	pj."typeInterview",
	pj.stopped,
	jsonb_build_object(
		'id', ja.id,
		'path', 'users/' || ja.user_id || '/jobsApplied/' || ja.id
	) AS job_applied_ref,
	jsonb_build_object(
		'id', ja.user_id,
		'path', 'users/' || ja.user_id
	) AS user_ref,
	jsonb_build_object(
		'id', ja.post_job_id,
		'path', 'companies/' || ja.company_id || '/postJob/' || ja.post_job_id
	) AS job_ref
FROM jobs_applied ja
LEFT JOIN users u   ON u.id  = ja.user_id
LEFT JOIN post_jobs pj ON pj.id = ja.post_job_id
LEFT JOIN interview_results ir ON ir.job_applied_id = ja.id;
`

const MIGRATION_0021 = `
-- Talent OS ATS Core (F2.10): screening knockout deterministico pre-entrevista.
-- Campos opcionais e aditivos; vagas/candidaturas antigas seguem validas sem backfill.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "knockoutTree" jsonb;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "screeningKnockoutAnswers" jsonb;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "screeningKnockoutResult" jsonb;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "screeningKnockoutTreeSnapshot" jsonb;
`

const MIGRATION_0022 = `
-- Talent OS ATS Core (F2.11): trilha de decisao da reprovacao.
-- Campos opcionais e aditivos; candidaturas antigas seguem validas sem backfill.
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionDecisionSource" text;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionDecidedByUserId" text;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionTaxonomyVersion" text;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionEvidence" text;

DROP VIEW IF EXISTS company_interviews_view;
CREATE VIEW company_interviews_view AS
SELECT
	ja.id,
	ja.company_id,
	ja.post_job_id,
	ja.user_id,
	ja.finished,
	ja.finished          AS finish,
	ja."candidateStatus",
	ja."appliedTime"     AS date,
	ja."dateSelect",
	ja."rejectionReasonCode",
	ja."rejectionReasonLabel",
	ja."rejectionNote",
	ja."rejectionFeedbackSentAt",
	ja."rejectionDecisionSource",
	ja."rejectionDecidedByUserId",
	ja."rejectionTaxonomyVersion",
	ja."rejectionEvidence",
	COALESCE(ir.score, '0') AS score,
	u.display_name       AS name,
	u.photo_url,
	u.occupation,
	u.external_id,
	u."professionalExperience",
	u.phone_number,
	u.state,
	u.city,
	u.email,
	pj."carrerLevel",
	pj."jobName",
	pj."jobDescription",
	pj."typeInterview",
	pj.stopped,
	jsonb_build_object(
		'id', ja.id,
		'path', 'users/' || ja.user_id || '/jobsApplied/' || ja.id
	) AS job_applied_ref,
	jsonb_build_object(
		'id', ja.user_id,
		'path', 'users/' || ja.user_id
	) AS user_ref,
	jsonb_build_object(
		'id', ja.post_job_id,
		'path', 'companies/' || ja.company_id || '/postJob/' || ja.post_job_id
	) AS job_ref
FROM jobs_applied ja
LEFT JOIN users u   ON u.id  = ja.user_id
LEFT JOIN post_jobs pj ON pj.id = ja.post_job_id
LEFT JOIN interview_results ir ON ir.job_applied_id = ja.id;
`

const MIGRATION_0023 = `
-- Talent OS ATS Core (TOS-027b): revisao humana de reprovacao automatizada.
-- Uma candidatura pode ter no maximo uma solicitacao de revisao.
CREATE TABLE IF NOT EXISTS rejection_review_requests (
	id text PRIMARY KEY,
	"companyId" text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	"jobId" text NOT NULL REFERENCES post_jobs(id) ON DELETE CASCADE,
	"jobAppliedId" text NOT NULL UNIQUE REFERENCES jobs_applied(id) ON DELETE CASCADE,
	"candidateUserId" text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	status text NOT NULL,
	"requestedAt" timestamptz NOT NULL,
	"candidateMessage" text,
	"reviewedByUserId" text,
	"reviewedAt" timestamptz,
	"reviewerNote" text,
	"outcomeMessage" text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rejection_review_requests_job_applied_idx ON rejection_review_requests ("jobAppliedId");
CREATE INDEX IF NOT EXISTS rejection_review_requests_company_status_requested_idx ON rejection_review_requests ("companyId", status, "requestedAt");
`

const MIGRATION_0024 = `
-- Talent OS ATS Core (F2.12): flags de risco no texto livre enviado ao candidato.
-- Campo opcional e aditivo; candidaturas antigas seguem validas sem backfill.
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "rejectionRiskFlags" text[];

DROP VIEW IF EXISTS company_interviews_view;
CREATE VIEW company_interviews_view AS
SELECT
	ja.id,
	ja.company_id,
	ja.post_job_id,
	ja.user_id,
	ja.finished,
	ja.finished          AS finish,
	ja."candidateStatus",
	ja."appliedTime"     AS date,
	ja."dateSelect",
	ja."rejectionReasonCode",
	ja."rejectionReasonLabel",
	ja."rejectionNote",
	ja."rejectionFeedbackSentAt",
	ja."rejectionDecisionSource",
	ja."rejectionDecidedByUserId",
	ja."rejectionTaxonomyVersion",
	ja."rejectionEvidence",
	ja."rejectionRiskFlags",
	COALESCE(ir.score, '0') AS score,
	u.display_name       AS name,
	u.photo_url,
	u.occupation,
	u.external_id,
	u."professionalExperience",
	u.phone_number,
	u.state,
	u.city,
	u.email,
	pj."carrerLevel",
	pj."jobName",
	pj."jobDescription",
	pj."typeInterview",
	pj.stopped,
	jsonb_build_object(
		'id', ja.id,
		'path', 'users/' || ja.user_id || '/jobsApplied/' || ja.id
	) AS job_applied_ref,
	jsonb_build_object(
		'id', ja.user_id,
		'path', 'users/' || ja.user_id
	) AS user_ref,
	jsonb_build_object(
		'id', ja.post_job_id,
		'path', 'companies/' || ja.company_id || '/postJob/' || ja.post_job_id
	) AS job_ref
FROM jobs_applied ja
LEFT JOIN users u   ON u.id  = ja.user_id
LEFT JOIN post_jobs pj ON pj.id = ja.post_job_id
LEFT JOIN interview_results ir ON ir.job_applied_id = ja.id;
`

const MIGRATION_0025 = `
-- Talent OS TOS-030: portal leve do hiring manager via review token.
-- Convite opaco (uso único no resgate) + accessCode pra sessão até expiry.
CREATE TABLE IF NOT EXISTS hm_review_tokens (
  id text PRIMARY KEY,
  "companyId" text NOT NULL,
  "jobId" text NOT NULL,
  "jobAppliedIds" jsonb NOT NULL,
  "createdByUserId" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "accessCode" text,
  "accessExpiresAt" timestamptz
);
CREATE INDEX IF NOT EXISTS hm_review_tokens_expires_idx ON hm_review_tokens ("expiresAt");
CREATE INDEX IF NOT EXISTS hm_review_tokens_access_code_idx ON hm_review_tokens ("accessCode");
CREATE INDEX IF NOT EXISTS hm_review_tokens_company_job_idx ON hm_review_tokens ("companyId", "jobId");
`

const MIGRATION_0026 = `
-- Talent OS TOS-013: CPF opcional no currículo vivo (hook → camada pessoa).
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS cpf text;
`

const MIGRATION_0027 = `
-- Talent OS TOS-026: anti-ghosting SLA (ack automático + gate de vaga).
-- Flags só em vagas novas (sem DEFAULT pra não backfillar legado).
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "antiGhostingEnabled" boolean;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "feedbackSlaHours" integer;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "slaIrregularSince" timestamptz;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "slaAlertSentAt" timestamptz;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "slaAutoStoppedAt" timestamptz;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "slaAutoStoppedByAntiGhosting" boolean;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "slaPublicBeforeAutoStop" boolean;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "ackSentAt" timestamptz;

DROP VIEW IF EXISTS company_interviews_view;
CREATE VIEW company_interviews_view AS
SELECT
	ja.id,
	ja.company_id,
	ja.post_job_id,
	ja.user_id,
	ja.finished,
	ja.finished          AS finish,
	ja."candidateStatus",
	ja."appliedTime"     AS date,
	ja."dateSelect",
	ja."rejectionReasonCode",
	ja."rejectionReasonLabel",
	ja."rejectionNote",
	ja."rejectionFeedbackSentAt",
	ja."rejectionDecisionSource",
	ja."rejectionDecidedByUserId",
	ja."rejectionTaxonomyVersion",
	ja."rejectionEvidence",
	ja."rejectionRiskFlags",
	ja."ackSentAt",
	COALESCE(ir.score, '0') AS score,
	u.display_name       AS name,
	u.photo_url,
	u.occupation,
	u.external_id,
	u."professionalExperience",
	u.phone_number,
	u.state,
	u.city,
	u.email,
	pj."carrerLevel",
	pj."jobName",
	pj."jobDescription",
	pj."typeInterview",
	pj.stopped,
	jsonb_build_object(
		'id', ja.id,
		'path', 'users/' || ja.user_id || '/jobsApplied/' || ja.id
	) AS job_applied_ref,
	jsonb_build_object(
		'id', ja.user_id,
		'path', 'users/' || ja.user_id
	) AS user_ref,
	jsonb_build_object(
		'id', ja.post_job_id,
		'path', 'companies/' || ja.company_id || '/postJob/' || ja.post_job_id
	) AS job_ref
FROM jobs_applied ja
LEFT JOIN users u   ON u.id  = ja.user_id
LEFT JOIN post_jobs pj ON pj.id = ja.post_job_id
LEFT JOIN interview_results ir ON ir.job_applied_id = ja.id;
`

const MIGRATION_0028 = `
-- Talent OS: feature flags opt-in por tenant (Company.featureFlags).
-- Default OFF — coluna nullable, sem backfill. Chaves tipadas no domain.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "featureFlags" jsonb;
`

const MIGRATION_0029 = `
-- Talent OS TOS-020: apply leve (candidatura sem mídia).
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "appliedWithoutInterview" boolean;
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "applicationDraft" jsonb;
`

const MIGRATION_0030 = `
-- V2-302: avaliação do recrutador (scorecard).
-- A nota humana NUNCA é fundida com a da IA: são leituras diferentes e a média
-- esconderia justamente o caso que mais importa — quando elas discordam.
CREATE TABLE IF NOT EXISTS scorecards (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  "jobId" text NOT NULL,
  "candidateId" text NOT NULL,
  "authorId" text NOT NULL,
  "authorName" text,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS scorecards_lookup_idx
  ON scorecards (company_id, "jobId", "candidateId");
-- um autor avalia uma vez por candidato numa vaga; reavaliar é editar
CREATE UNIQUE INDEX IF NOT EXISTS scorecards_author_unique_idx
  ON scorecards (company_id, "jobId", "candidateId", "authorId");
`

const MIGRATION_0031 = `
-- V2-303: linha do tempo do candidato (eventos de sistema + comentários).
CREATE TABLE IF NOT EXISTS candidate_timeline (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  "jobId" text NOT NULL,
  "candidateId" text NOT NULL,
  type text NOT NULL,
  "authorId" text,
  "authorName" text,
  body text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS candidate_timeline_lookup_idx
  ON candidate_timeline (company_id, "jobId", "candidateId", created_at);
`

const MIGRATION_0032 = `
-- V2-401: requisição de vaga com aprovação.
CREATE TABLE IF NOT EXISTS job_requisitions (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  title text NOT NULL,
  area text,
  reason text,
  headcount integer DEFAULT 1,
  "salaryRangeMin" integer,
  "salaryRangeMax" integer,
  currency text,
  "requestedByUserId" text NOT NULL,
  "requestedByName" text,
  status text NOT NULL,
  "decidedByUserId" text,
  "decidedByName" text,
  "decidedAt" timestamptz,
  "decisionNote" text,
  "jobId" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS job_requisitions_company_status_idx
  ON job_requisitions (company_id, status);
`

const MIGRATION_0033 = `
-- V2-402/403: oferta e dados de contratação.
CREATE TABLE IF NOT EXISTS offers (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  "jobId" text NOT NULL,
  "candidateId" text NOT NULL,
  "salaryMinor" integer NOT NULL,
  currency text NOT NULL,
  "contractType" text,
  "startDate" timestamptz,
  notes text,
  status text NOT NULL,
  "sentAt" timestamptz,
  "respondedAt" timestamptz,
  "declineReason" text,
  "createdByUserId" text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS offers_lookup_idx ON offers (company_id, "jobId", "candidateId");

-- Dados de contratação no próprio JobApplied: 'hired' deixa de ser só rótulo.
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "hiringInfo" jsonb;
`

const MIGRATION_0034 = `
-- V2-501/502: estrutura organizacional e campos customizados.
-- UM tipo com \`kind\` para área/departamento/centro de custo/unidade: o dado se
-- comporta igual, e quatro tabelas multiplicariam CRUD e tela por quatro.
CREATE TABLE IF NOT EXISTS org_units (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  kind text NOT NULL,
  name text NOT NULL,
  "externalCode" text,
  "parentId" text,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS org_units_company_kind_idx ON org_units (company_id, kind);

CREATE TABLE IF NOT EXISTS custom_fields (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  entity text NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL,
  options jsonb,
  required boolean DEFAULT false,
  "order" integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_fields_company_entity_idx ON custom_fields (company_id, entity);
CREATE UNIQUE INDEX IF NOT EXISTS custom_fields_key_unique_idx
  ON custom_fields (company_id, entity, key);

-- valores dos campos, junto do dado a que pertencem
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "customFields" jsonb;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "orgUnitIds" jsonb;

-- V2-503: templates de e-mail editáveis. Um por tipo, por empresa.
CREATE TABLE IF NOT EXISTS email_templates (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  kind text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  active boolean DEFAULT true,
  "updatedByUserId" text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
`

const MIGRATION_0035 = `
-- V2-504: assinatura de eventos por webhook.
-- NULL de propósito: webhook existente continua recebendo só o de resultado.
-- Assinar tráfego novo tem que ser ato explícito do cliente.
ALTER TABLE result_webhooks ADD COLUMN IF NOT EXISTS events jsonb;
`

const MIGRATION_0036 = `
-- V2-701: consentimento LGPD e trilha de operações sobre dado pessoal.
-- Sem FK para users de propósito: a trilha sobrevive à exclusão do titular,
-- senão apagar o dado apagaria junto a prova de que a exclusão foi feita.
CREATE TABLE IF NOT EXISTS data_consents (
  id text PRIMARY KEY,
  "userId" text NOT NULL,
  "companyId" text,
  purpose text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  "grantedAt" timestamptz,
  "expiresAt" timestamptz,
  "revokedAt" timestamptz,
  "policyVersion" text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_consents_user_idx ON data_consents ("userId");

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id text PRIMARY KEY,
  "userId" text NOT NULL,
  "companyId" text,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "requestedBy" text,
  affected jsonb,
  error text
);
CREATE INDEX IF NOT EXISTS data_subject_requests_user_idx ON data_subject_requests ("userId");

-- Política de retenção por empresa (prazo contado da última interação).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "retentionPolicy" jsonb;
`

const MIGRATION_0037 = `
-- V2-801: taxonomia de ocupações e skills (CBO/ESCO).
-- Sem companyId: é dado público, igual para todos os tenants.
CREATE TABLE IF NOT EXISTS occupations (
  id text PRIMARY KEY,
  source text NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  synonyms jsonb NOT NULL DEFAULT '[]'::jsonb,
  "familyCode" text,
  "groupCode" text,
  "mappedTo" text,
  "taxonomyVersion" text NOT NULL,
  language text
);
CREATE INDEX IF NOT EXISTS occupations_version_idx ON occupations ("taxonomyVersion");

CREATE TABLE IF NOT EXISTS skills (
  id text PRIMARY KEY,
  name text NOT NULL,
  synonyms jsonb NOT NULL DEFAULT '[]'::jsonb,
  category text,
  source text,
  "taxonomyVersion" text NOT NULL,
  "pendingCuration" boolean DEFAULT false,
  occurrences integer DEFAULT 0
);
CREATE INDEX IF NOT EXISTS skills_version_idx ON skills ("taxonomyVersion");

-- V2-803: ocupação canônica ao lado do texto original, nunca no lugar dele.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "occupationCode" text;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "taxonomyVersion" text;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "occupationCode" text;
ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "taxonomyVersion" text;
`

const MIGRATION_0038 = `
-- V2-502: a vaga passa a apontar para a unidade organizacional e a guardar os
-- valores dos campos que a empresa definiu. Sem isso, org_units e custom_fields
-- eram cadastros que nada consumia.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "orgUnitId" text;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "customFieldValues" jsonb;
CREATE INDEX IF NOT EXISTS post_jobs_org_unit_idx ON post_jobs ("orgUnitId");
`

const MIGRATION_0039 = `
-- V2-105: o que cada etapa dispara quando o candidato entra nela.
-- Mapa por id de etapa (e não coluna dentro do catálogo) porque as etapas da
-- régua canônica não são editáveis e é nelas que a ação mais faz sentido.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "stageActions" jsonb;
`

const MIGRATION_0040 = `
-- Portal de vagas: posição vertical do recorte do banner (0-100, % do
-- object-position). O banner raramente tem a proporção da faixa — a empresa
-- escolhe qual fatia aparece, como na capa do YouTube.
ALTER TABLE job_portal ADD COLUMN IF NOT EXISTS "bannerPosition" integer;
`

const MIGRATION_0041 = `
-- Portal de vagas: presença da empresa fora do portal (website, LinkedIn,
-- Instagram, Facebook, Glassdoor). JSONB único: é UM assunto, e rede nova
-- não deve pedir migration.
ALTER TABLE job_portal ADD COLUMN IF NOT EXISTS "socialLinks" jsonb;
`

const MIGRATION_0042 = `
-- OTS 0.2: emissões de attestation (spec-0.2). A linha é a fonte da
-- revogação (statusUrl consulta por jti) e guarda o JWS pro dono re-baixar.
CREATE TABLE IF NOT EXISTS ots_attestations (
	id text PRIMARY KEY,
	"userId" text NOT NULL,
	"jobAppliedId" text NOT NULL,
	"companyId" text,
	"jobId" text,
	tier text NOT NULL,
	kid text NOT NULL,
	jws text NOT NULL,
	"issuedAt" timestamptz NOT NULL,
	"expiresAt" timestamptz,
	"revokedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS ots_attestations_user_idx ON ots_attestations ("userId");
`

const MIGRATION_0043 = `
-- Consumo de OTS (ADR-007, decisão 6): snapshot da prova de entrevista
-- verificada apresentada pelo candidato no apply.
ALTER TABLE jobs_applied ADD COLUMN IF NOT EXISTS "otsAttestation" jsonb;
`

const MIGRATION_0044 = `
-- Tela Servidor (open): transporte SMTP da instalação em global_settings.
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS smtp jsonb;
`

const MIGRATION_0045 = `
-- 9 campos de PostJob sem coluna no selfhosted: o write descartava em
-- silêncio (intenção de contratação, régua kanban própria, competências do
-- wizard, pausa por inatividade). Relato do teste da open, 2026-08-22.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "kanbanConfig" jsonb;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "evaluation" jsonb;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "competencias_criticas" text;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "competencias_adicionais" text;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "expectativas" text;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "hiringIntent" text;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "freshnessSlaDays" integer;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "lastActivityAt" timestamptz;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "freshnessPausedAt" timestamptz;
`

const MIGRATION_0046 = `
-- Vaga rica (leva 2026-08-22): benefícios (Markdown) e salário viram campos de
-- primeira classe da vaga (antes só existiam no jobDescriptionMetadata que o
-- Motor preenchia); portal ganha "sobre a empresa" (Markdown) e vídeo.
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "benefits" text;
ALTER TABLE post_jobs ADD COLUMN IF NOT EXISTS "salary" text;
ALTER TABLE job_portal ADD COLUMN IF NOT EXISTS "about" text;
ALTER TABLE job_portal ADD COLUMN IF NOT EXISTS "videoUrl" text;
`

const MIGRATION_0047 = `
-- Licença do plugin Motor (ADR-008 fase 1): estado local em global_settings
-- e a tabela de licenças (lado servidor — inerte na open, presente por
-- paridade de adapters).
ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS "motorPlugin" jsonb;
CREATE TABLE IF NOT EXISTS motor_licenses (
	id text PRIMARY KEY,
	plan text,
	status text,
	"issuedTo" text,
	notes text,
	"createdAt" timestamptz,
	"lastSeenAt" timestamptz,
	instance jsonb
);
`

const MIGRATIONS: Array<{ id: string; sql: string }> = [
	{
		id: '0001_normalized_relational.sql',
		sql: NORMALIZED_SCHEMA_SQL,
	},
	{
		id: '0002_new_collections.sql',
		sql: MIGRATION_0002,
	},
	{
		id: '0003_auth_user_rename.sql',
		sql: MIGRATION_0003,
	},
	{
		id: '0004_gupy_integrations_expand.sql',
		sql: MIGRATION_0004,
	},
	{
		id: '0005_postjob_interview_mode.sql',
		sql: MIGRATION_0005,
	},
	{
		id: '0006_ai_usage_cached_prompt_tokens.sql',
		sql: MIGRATION_0006,
	},
	{
		id: '0007_postjob_priority.sql',
		sql: MIGRATION_0007,
	},
	{
		id: '0008_shared_candidate_links.sql',
		sql: MIGRATION_0008,
	},
	{
		id: '0009_interview_abandonments.sql',
		sql: MIGRATION_0009,
	},
	{
		id: '0010_language_proficiency_fields.sql',
		sql: MIGRATION_0010,
	},
	{
		id: '0011_postjob_profile_interview.sql',
		sql: MIGRATION_0011,
	},
	{
		id: '0012_interview_handoffs.sql',
		sql: MIGRATION_0012,
	},
	{
		id: '0013_candidate_profiles.sql',
		sql: MIGRATION_0013,
	},
	{
		id: '0014_caption_segments.sql',
		sql: MIGRATION_0014,
	},
	{
		id: '0015_interview_translation_cache.sql',
		sql: MIGRATION_0015,
	},
	{
		id: '0016_talent_credits.sql',
		sql: MIGRATION_0016,
	},
	{
		id: '0017_pessoa.sql',
		sql: MIGRATION_0017,
	},
	{
		id: '0018_domain_events_outbox.sql',
		sql: MIGRATION_0018,
	},
	{
		id: '0019_postjob_structured_requirements.sql',
		sql: MIGRATION_0019,
	},
	{
		id: '0020_job_applied_rejection_reasons.sql',
		sql: MIGRATION_0020,
	},
	{
		id: '0021_screening_knockout.sql',
		sql: MIGRATION_0021,
	},
	{
		id: '0022_rejection_decision_audit.sql',
		sql: MIGRATION_0022,
	},
	{
		id: '0023_rejection_review_requests.sql',
		sql: MIGRATION_0023,
	},
	{
		id: '0024_rejection_feedback_risk_flags.sql',
		sql: MIGRATION_0024,
	},
	{
		id: '0025_hm_review_tokens.sql',
		sql: MIGRATION_0025,
	},
	{
		id: '0026_candidate_profiles_cpf.sql',
		sql: MIGRATION_0026,
	},
	{
		id: '0027_anti_ghosting_sla.sql',
		sql: MIGRATION_0027,
	},
	{
		id: '0028_company_feature_flags.sql',
		sql: MIGRATION_0028,
	},
	{
		id: '0029_apply_lite.sql',
		sql: MIGRATION_0029,
	},
	{
		id: '0030_scorecards.sql',
		sql: MIGRATION_0030,
	},
	{
		id: '0031_candidate_timeline.sql',
		sql: MIGRATION_0031,
	},
	{
		id: '0032_job_requisitions.sql',
		sql: MIGRATION_0032,
	},
	{
		id: '0033_offers_hiring.sql',
		sql: MIGRATION_0033,
	},
	{
		id: '0034_org_custom_fields.sql',
		sql: MIGRATION_0034,
	},
	{
		id: '0035_webhook_events.sql',
		sql: MIGRATION_0035,
	},
	{
		id: '0036_lgpd_consent.sql',
		sql: MIGRATION_0036,
	},
	{
		id: '0037_taxonomy.sql',
		sql: MIGRATION_0037,
	},
	{
		id: '0038_job_org_unit_and_custom_fields',
		sql: MIGRATION_0038,
	},
	{
		id: '0039_company_stage_actions',
		sql: MIGRATION_0039,
	},
	{
		id: '0040_job_portal_banner_position',
		sql: MIGRATION_0040,
	},
	{
		id: '0041_job_portal_social_links',
		sql: MIGRATION_0041,
	},
	{
		id: '0042_ots_attestations',
		sql: MIGRATION_0042,
	},
	{
		id: '0043_jobs_applied_ots_attestation',
		sql: MIGRATION_0043,
	},
	{
		id: '0044_global_settings_smtp',
		sql: MIGRATION_0044,
	},
	{
		id: '0045_post_jobs_missing_columns',
		sql: MIGRATION_0045,
	},
	{
		id: '0046_rich_job_page',
		sql: MIGRATION_0046,
	},
	{
		id: '0047_motor_plugin_license',
		sql: MIGRATION_0047,
	},
]



const MIGRATION_LOCK_ID = 824_991_503

export async function runMigrations(db: DrizzleDb): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`)

		await tx.execute(sql`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				id text PRIMARY KEY,
				applied_at timestamptz NOT NULL DEFAULT now()
			)
		`)

		const applied = await tx.select().from(infraMigrations).orderBy(asc(infraMigrations.id))
		const appliedSet = new Set(applied.map((m) => m.id))

		for (const migration of MIGRATIONS) {
			if (appliedSet.has(migration.id)) continue

			await tx.execute(sql.raw(migration.sql))
			await tx.insert(infraMigrations).values({ id: migration.id }).onConflictDoNothing()
			console.info(`[SelfHosted/Postgres] Applied migration ${migration.id}`)
		}
	})
}

export async function isMigrationApplied(db: DrizzleDb, migrationName: string): Promise<boolean> {
	const row = await db
		.select({ id: infraMigrations.id })
		.from(infraMigrations)
		.where(eq(infraMigrations.id, migrationName))
		.limit(1)

	return row.length > 0
}
