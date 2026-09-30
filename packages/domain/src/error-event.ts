/**
 * Evento de falha persistido pelo orchestrator (e outros apps) sempre que
 * `sendErrorAlert` dispara. É a fonte de dados pra tela de Confiabilidade
 * no admin (entrevistas presas, retries esgotados, falhas de webhook etc).
 */
export interface ErrorEvent {
	id: string
	/**
	 * Subsistema que reportou (ex: 'orchestrator/transcription',
	 * 'orchestrator/finish', 'orchestrator/engine-callback').
	 */
	service: string
	/** Descrição curta do ponto de falha. */
	failurePoint: string
	/** Quando aplicável: a entrevista (jobApplied) afetada. */
	interviewId?: string | null
	userId?: string | null
	candidateName?: string | null
	jobName?: string | null
	companyId?: string | null
	companyName?: string | null
	questionId?: string | null
	/** Função/método que originou o erro, pra log. */
	method?: string | null
	/** Total de tentativas feitas antes de desistir. */
	retryCount?: number | null
	/** Mensagem do erro original (sem stack). */
	errorMessage?: string | null
	errorStack?: string | null
	/** Contexto livre (objeto serializável). */
	extra?: Record<string, unknown> | null
	/** Marcação manual do time depois de tratar. */
	resolved?: boolean | null
	resolvedAt?: string | null
	resolvedBy?: string | null
	createdAt?: string | null
}
