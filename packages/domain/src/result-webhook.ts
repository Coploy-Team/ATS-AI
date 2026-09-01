export interface ResultWebhook {
	id: string
	companyId: string

	name: string
	url: string
	method: 'POST' | 'PATCH' | 'PUT'
	headers?: Record<string, string> | null

	/**
	 * Tipos de evento assinados (V2-504).
	 *
	 * `null`/ausente = comportamento legado: só `interview.finished`. Assinar
	 * eventos é opt-in — webhook existente não pode começar a receber tráfego
	 * que o cliente não pediu e cujo endpoint talvez não saiba tratar.
	 */
	events?: string[] | null

	approvalThreshold?: number | null
	onlyOnApproval?: boolean | null
	enabled?: boolean | null

	createdAt?: string | null
	updatedAt?: string | null
}
