export type AiUsageSource =
	| 'ai_engine'
	| 'orchestrator'
	| 'core'
	| 'whatsapp_interview'

export type AiUsageSurface =
	| 'job_generate_description'
	| 'job_generate_skills'
	| 'job_generate_post_description'
	| 'job_generate_questions'
	| 'evaluation_generate_questions'
	| 'interview_question'
	| 'interview_final'
	| 'interview_finish'
	| 'language_question'
	| 'language_final'
	| 'exit_interview'
	| 'cheat_detection'
	| 'insights'
	| 'screening'
	| 'screening_description'
	| 'screening_questions'
	| 'translate'
	| 'voice_whisper'
	| 'voice_gpt'
	| 'voice_tts'
	| 'whatsapp_gpt'
	| 'whatsapp_whisper'
	/** Busca conversacional no banco de talentos (assistente de hunting). */
	| 'hunting_intent'
	| 'batch'

export interface AiUsageEvent {
	id: string
	companyId: string
	companyName?: string | null
	occurredAt: string
	occurredDate: string
	occurredMonth: string
	source: AiUsageSource
	surface: AiUsageSurface
	provider: 'openai' | 'minimax'
	model: string
	promptTokens?: number | null
	cachedPromptTokens?: number | null
	completionTokens?: number | null
	totalTokens?: number | null
	audioSeconds?: number | null
	estimatedCostMicroUsd?: number | null
	requestId?: string | null
	jobAppliedId?: string | null
	postJobId?: string | null
	userId?: string | null
	metadata?: Record<string, unknown> | null
	createdAt?: string | null
}
