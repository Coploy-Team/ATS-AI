import type { EntityRef } from './common'
import type { ScreeningKnockoutTree } from './job'
import type { VerifiedOtsAttestation } from './ots-attestation'

export type RejectionDecisionSource = 'manual' | 'bulk' | 'knockout'
export type RejectionReviewStatus = 'pending' | 'upheld' | 'overturned'

export interface RejectionReviewRequest {
	id: string
	companyId: string
	jobId: string
	jobAppliedId: string
	candidateUserId: string
	status: RejectionReviewStatus
	requestedAt: Date
	candidateMessage?: string | null
	reviewedByUserId?: string | null
	reviewedAt?: Date | null
	reviewerNote?: string | null
	outcomeMessage?: string | null
}

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
	/**
	 * Análise de autenticidade (detecção de cola).
	 *
	 * Ficava de fora da tradução, então o recrutador trocava o idioma e o único
	 * bloco em inglês na tela era justamente o que fundamenta uma acusação
	 * grave — o mais importante de se entender bem.
	 */
	cheat?: Record<string, unknown> | null
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
	// ── Language proficiency (quando PostJob.evaluateLanguage = true) ───────
	// Campos SEPARADOS dos técnicos (`score`/`feedback`), nunca reusados.
	languageScore?: number | null
	languageFeedback?: string | null
	languageAnalise?: string | null
}

/** Resultado final da avaliação de proficiência de idioma de uma entrevista.
 *  Espelha `LanguageFinalOutput` do ai-engine ({ feedback, analise, fluencia, score }),
 *  renomeando `fluencia` → `nivel` no domínio. `feedback` é pro candidato,
 *  `analise` é pra empresa. */
export interface LanguageEvaluation {
	score: number
	nivel: string
	feedback: string
	analise: string
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

// ── Main entity ──────────────────────────────────────────────────────

/**
 * Rascunho do apply leve (TOS-020) — campos curtos coletados antes da entrevista.
 * Não inclui mídia; respostas de knockout ficam em `screeningKnockoutAnswers`.
 */
export interface ApplicationDraft {
	name?: string | null
	email?: string | null
	phone?: string | null
	/** Link de CV opcional — não é upload binário. */
	resumeUrl?: string | null
	notes?: string | null
}

/**
 * Origem da entrada no funil (V2-601, GAP 5).
 *
 * `direct` é default EXPLÍCITO, nunca vazio: origem em branco não distingue
 * "chegou direto" de "esquecemos de marcar", e é justamente essa diferença que
 * decide se o dado de source-of-hire serve para alguma coisa.
 */
export const CANDIDATE_SOURCES = [
	/** Link da vaga aberto direto, sem intermediário identificável. */
	'direct',
	/** Página de carreiras da empresa. */
	'careers',
	/** Link compartilhado por alguém do time. */
	'shared_link',
	/** Convite enviado pelo recrutador (inclui reengajamento). */
	'invite',
	/** Integração Gupy. */
	'gupy',
	/** Plugin MCP (ChatGPT/Claude). */
	'mcp',
	/** Entrevista via WhatsApp. */
	'whatsapp',
	/** Hunting: recrutador achou a pessoa no pool. */
	'hunting',
	/** Importação em massa (CSV, migração de outro ATS). */
	'import',
	/** Indicação. */
	'referral',
] as const

export type CandidateSource = (typeof CANDIDATE_SOURCES)[number]

export const DEFAULT_CANDIDATE_SOURCE: CandidateSource = 'direct'

export interface JobApplied {
	id: string
	/** Origem da candidatura (V2-601). Ver {@link CANDIDATE_SOURCES}. */
	source?: CandidateSource | null
	/**
	 * Detalhe livre da origem: campanha do link, nome de quem indicou, id do
	 * job na Gupy. Fica separado de `source` porque a agregação do analytics
	 * precisa de um conjunto fechado — texto livre não agrupa.
	 */
	sourceDetail?: string | null
	finished?: boolean | null
	candidateStatus?: string | null
	isPracticing?: boolean | null
	typeInterview?: string | null
	appliedTime?: Date | null
	finishedTime?: Date | null
	dateSelect?: Date | null
	/**
	 * Candidatura registrada sem mídia/entrevista (apply leve, TOS-020).
	 * Quando true, o JobApplied nasceu antes da sessão; o orchestrator deve
	 * reusar este doc (idempotência via find por jobApplied ref).
	 */
	appliedWithoutInterview?: boolean | null
	/** Rascunho parcial do formulário curto de apply leve. */
	applicationDraft?: ApplicationDraft | null
	rejectionReasonCode?: string | null
	rejectionReasonLabel?: string | null
	rejectionNote?: string | null
	rejectionFeedbackSentAt?: Date | null
	rejectionDecisionSource?: RejectionDecisionSource | null
	rejectionDecidedByUserId?: string | null
	rejectionTaxonomyVersion?: string | null
	rejectionEvidence?: string | null
	rejectionRiskFlags?: string[] | null
	/**
	 * Ack automático anti-ghosting (TOS-026). Timestamp do e-mail de
	 * recebimento da candidatura. Ausente = ainda não enviado; idempotente.
	 */
	ackSentAt?: Date | null
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
	state?: boolean | string | null
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
	// ── Avaliação final de proficiência de idioma ───────────────────────────
	// Preenchido só quando PostJob.evaluateLanguage = true. Nulo/ausente caso contrário.
	languageEvaluation?: LanguageEvaluation | null
	/**
	 * Prova de entrevista verificada (OTS 0.2) apresentada pelo candidato no
	 * apply e verificada por nós — consumo do padrão (ADR-007, decisão 6).
	 */
	otsAttestation?: VerifiedOtsAttestation | null
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
	rejectionDecisionSource?: RejectionDecisionSource | null
	rejectionDecidedByUserId?: string | null
	rejectionTaxonomyVersion?: string | null
	rejectionEvidence?: string | null
	rejectionRiskFlags?: string[] | null
	/** Ack automático anti-ghosting (TOS-026). Espelho de JobApplied.ackSentAt. */
	ackSentAt?: Date | null
	/** Origem da candidatura (V2-601). Espelho de JobApplied.source. */
	source?: CandidateSource | null
	sourceDetail?: string | null
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
	/** Snake-case alias (Firestore legacy — escrito pelo legado C#). */
	professional_experience?: string | null
	score?: string | number | null
	/**
	 * Espelho numérico de `score` — usado para `orderBy('score_value', 'desc')`
	 * no hunting (Firestore não consegue ordenar string como número).
	 *
	 * Escrito por finish-service e admin sync em todas as finalizações novas.
	 * Para popular docs legados, usar:
	 *   POST /admin/public-interviews/backfill-score-value
	 */
	score_value?: number | null
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
