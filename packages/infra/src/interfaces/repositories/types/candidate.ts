import type { EntityRef } from './common'
import type { ScreeningKnockoutTree } from './job'

// ── Interview sub-types ──────────────────────────────────────────────

/** Individual question answer within an interview. */
export interface CaptionSegment {
	start: number
	end: number
	text: string
}

export type InterviewTranslationLanguage = 'pt-BR' | 'en' | 'es' | 'fr' | 'it'

export interface InterviewResultTranslation {
	interview?: Record<string, unknown> | null
	avaliacaoFinal?: CandidateEvaluation | null
	languageEvaluation?: LanguageEvaluation | null
}

export interface InterviewInfoItem {
	analyze?: string | null
	answer?: string
	captionSegments?: CaptionSegment[] | null
	captionTranslations?: Partial<Record<InterviewTranslationLanguage, CaptionSegment[] | null>> | null
	feedback?: string | null
	finished?: boolean
	id?: string
	improvement?: string[]
	metricas_decisao?: Record<string, unknown> | string | null
	qRecomendation?: string | null
	question?: string
	score?: number
	score_detalhado?: Record<string, unknown> | null
	skills?: string | null
	strengths?: string[]
	video?: string
	audio?: string
	avaliacao_pergunta?: Record<string, unknown> | null
	pulou_a_pergunta?: boolean
	transcription_status?: string
	languageScore?: number | null
	languageFeedback?: string | null
	languageAnalise?: string | null
}

/** Interview data embedded in a JobApplied document. */
export interface InterviewData {
	id?: string
	dateTime?: Date | null
	answers?: InterviewAnswer[]
	generalFeedback?: string | null
	generalStrengths?: string[] | null
	generalImprovement?: string[] | null
	translationCache?: Partial<Record<InterviewTranslationLanguage, InterviewResultTranslation>> | null
	info?: InterviewInfoItem[]
	additional?: Record<string, unknown>[]
	job?: string | null
	leveljob?: string | null
	recomentation?: string | null
	score?: string | number | null
	state?: boolean
	scom?: number
	sres?: number
	stec?: number
	aderencia_descricao?: number
	alinhamento_responsabilidades?: number
	requisitos_atendidos?: number
	alinhamento_nivel?: number
	gap_para_proximo_nivel?: number
	estruturacao?: number
	exemplificacao?: number
	profundidade?: number
	nivel_confianca?: number
	cheat?: Record<string, unknown> | null
}

/** Structured interview answer. */
export interface InterviewAnswer {
	answer?: string
	finished?: boolean
	id?: string
	question?: string
	video?: string
	aderencia_descricao?: number
	alinhamento_nivel?: number
	alinhamento_responsabilidades?: number
	dateTime?: Date | null
	estruturacao?: number
	exemplificacao?: number
	gap_para_proximo_nivel?: number
	generalFeedback?: string | null
	generalImprovement?: string | null
	generalStrengths?: string | null
	info?: InterviewInfoItem[]
}

// ── Batch Processing ─────────────────────────────────────────────────

/** Batch processing status for async AI evaluations. */
export interface BatchProcessingData {
	status?:
		| 'none'
		| 'queued'
		| 'processing'
		| 'completed'
		| 'failed'
		| 'cancelled'
		| 'fast_tracking'
		| 'fast_tracked'
		| string
	engineBatchId?: string | null
	openaiBatchId?: string | null
	openaiFileId?: string | null
	queuedAt?: Date | null
	processingStartedAt?: Date | null
	completedAt?: Date | null
	fastTrackedAt?: Date | null
	fastTrackedBy?: string | null
	error?: string | null
	questionsProcessed?: number
	totalQuestions?: number
	totalTokensUsed?: number
	promptTokensUsed?: number
	completionTokensUsed?: number
}

// ── WhatsApp Triagem ─────────────────────────────────────────────────

/** WhatsApp screening result. */
export interface WhatsappTriagemResult {
	feedback_geral?: string
	porcentagem_match?: number
	recomendacao_recrutador?: string
	requisitos_atendidos?: string[]
	requisitos_nao_atendidos?: string[]
	pontos_atencao?: string[]
}

// ── Avaliação Final ──────────────────────────────────────────────────

/** Final candidate evaluation / scoring data. */
export interface CandidateEvaluation {
	competencias_criticas?: Array<{
		nome?: string
		pontuacao?: number
		pontos_fortes?: string[]
		pontos_desenvolvimento?: string[]
		score?: number
	}>
	competencias_adicionais?: Array<{
		nome?: string
		pontuacao?: number
		pontos_fortes?: string[]
		pontos_desenvolvimento?: string[]
		score?: number
	}>
	atendimento_expectativas?: Array<{
		nome?: string
		nivel_atendimento?: number
		evidencias?: string[]
		gaps?: string[]
	}>
	recomendacoes?: {
		pontos_fortes?: string[]
		areas_desenvolvimento?: string[]
		sugestoes_melhoria?: string[]
	}
	generalFeedback?: string
	generalRecomendation?: string
	score?: number
	pontuacao_final?: number
	nivel?: string
	resumo?: string
}

export interface LanguageEvaluation {
	score: number
	nivel: string
	feedback: string
	analise: string
}

// ── Main entity ──────────────────────────────────────────────────────

export interface JobApplied {
	id: string
	finished?: boolean | null
	candidateStatus?: string | null
	isPracticing?: boolean | null
	typeInterview?: string | null
	appliedTime?: Date | null
	finishedTime?: Date | null
	dateSelect?: Date | null
	rejectionReasonCode?: string | null
	rejectionReasonLabel?: string | null
	rejectionNote?: string | null
	rejectionFeedbackSentAt?: Date | null
	rejectionDecisionSource?: 'manual' | 'bulk' | 'knockout' | null
	rejectionDecidedByUserId?: string | null
	rejectionTaxonomyVersion?: string | null
	rejectionEvidence?: string | null
	rejectionRiskFlags?: string[] | null
	screeningKnockoutAnswers?: Record<string, unknown> | null
	screeningKnockoutResult?: {
		treeVersion: number | null
		passed: boolean
		score: number
		failedNodeIds: string[]
		rejectionReasonCode: string | null
		evaluatedAt: Date | null
	} | null
	screeningKnockoutTreeSnapshot?: ScreeningKnockoutTree | null
	companyOwner?: EntityRef | null
	/** Reference to the PostJob. */
	jobApplied?: EntityRef | null
	/** Reference to the User. */
	userApplied?: EntityRef | null
	// ── Scored results (top-level) ───────────────────────────
	score?: string | number | null
	scom?: number | null
	sres?: number | null
	stec?: number | null
	job?: string | null
	leveljob?: string | null
	recomentation?: string | null
	state?: boolean | null
	nivel_confianca?: number | null
	profundidade?: number | null
	requisitos_atendidos?: number | null
	// ── Rich nested data ─────────────────────────────────────
	interview?: InterviewData | null
	additional?: Array<{
		answer?: string
		question?: string
		finished?: boolean
		id?: string
		video?: string
	}> | null
	whatsappTriagemResult?: WhatsappTriagemResult | null
	exitJobResult?: Record<string, unknown> | null
	avaliacaoFinal?: CandidateEvaluation | null
	batchProcessing?: BatchProcessingData | null
	languageEvaluation?: LanguageEvaluation | null
	// ── Denormalized fields (set by services) ────────────────
	candidateName?: string | null
	jobName?: string | null
	jobDescription?: string | null
	jobLevel?: string | null
	jobResponsibilities?: string | null
	jobRequirements?: string | null
	evaluationLanguage?: string | null
	language?: string | null
	engineBatchId?: string | null
	engineBatchStatus?: string | null
	likes?: CandidateLike[] | null
}

/** Denormalized view combining job-applied, user, and job data — returned by list operations. */
export interface CompanyInterview {
	id: string
	company_id?: string | null
	post_job_id?: string | null
	user_id?: string | null
	finished?: boolean | null
	finish?: boolean | null
	candidateStatus?: string | null
	date?: Date | null
	dateSelect?: Date | null
	rejectionReasonCode?: string | null
	rejectionReasonLabel?: string | null
	rejectionNote?: string | null
	rejectionFeedbackSentAt?: Date | null
	rejectionDecisionSource?: 'manual' | 'bulk' | 'knockout' | null
	rejectionDecidedByUserId?: string | null
	rejectionTaxonomyVersion?: string | null
	rejectionEvidence?: string | null
	rejectionRiskFlags?: string[] | null
	score?: string | number | null
	name?: string | null
	photo_url?: string | null
	occupation?: string | null
	external_id?: string | null
	professionalExperience?: string | null
	phone_number?: string | null
	state?: string | null
	city?: string | null
	email?: string | null
	carrerLevel?: string | null
	jobName?: string | null
	jobDescription?: string | null
	typeInterview?: string | null
	stopped?: boolean | null
	job_applied_ref?: EntityRef | null
	user_ref?: EntityRef | null
	job_ref?: EntityRef | null
}

/** Public-facing interview view (no personal data). */
export interface PublicInterview {
	id: string
	company_id?: string | null
	date?: Date | null
	email?: string | null
	external_id?: string | null
	jobName?: string | null
	/** Snake-case alias (Firestore legacy). */
	job_name?: string | null
	name?: string | null
	occupation?: string | null
	phone_number?: string | null
	photo_url?: string | null
	professionalExperience?: string | null
	score?: string | number | null
	state?: string | null
	city?: string | null
	carrerLevel?: string | null
	/** Snake-case alias (Firestore legacy). */
	career_level?: string | null
	typeInterview?: string | null
	/** Snake-case alias (Firestore legacy). */
	type_interview?: string | null
	academic?: string | null
	job_applied_ref?: EntityRef | null
	job_ref?: EntityRef | null
	user_ref?: EntityRef | null
	/** Interview tags / AI analysis metadata (structure varies). */
	interview_tags?: Record<string, unknown> | null
}

export interface CandidateLike {
	id: string
	user_id?: string | null
	name?: string | null
	avatar_url?: string | null
	email?: string | null
	action?: boolean | null
	created_at?: Date | null
}
