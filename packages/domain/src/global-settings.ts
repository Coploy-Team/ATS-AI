/**
 * Configurações globais do produto, editáveis via admin console.
 *
 * Singleton: existe apenas 1 documento (Firestore: `globalSettings/singleton`).
 *
 * Hoje só tem `errorAlertRecipients`, mas o tipo é desenhado pra acomodar
 * outras flags de configuração no futuro (ex: rate limits globais, feature
 * flags por ambiente etc).
 */
/**
 * SMTP da INSTALAÇÃO (distribuição open) — configurado pela tela Servidor
 * do ATS pelo dono, guardado aqui em vez de env pra não exigir redeploy.
 * A senha fica no banco da própria instância (infra do operador); a API
 * nunca a devolve em leitura.
 */
export interface SmtpSettings {
	host: string
	port: number
	/** TLS implícito (465). false = STARTTLS/plain conforme a porta. */
	secure: boolean
	user?: string | null
	pass?: string | null
	/** Remetente: "Nome <email@dominio>" ou só o e-mail. */
	from: string
}

/**
 * Licença do plugin Motor NESTA instalação  — gravada pela
 * tela Servidor. `status` é o resultado do último contato com o servidor de
 * licenças da Coploy; `unreachable` é estado próprio (rede fora ≠ chave ruim).
 */
export interface MotorPluginSettings {
	licenseKey: string
	status: 'active' | 'invalid' | 'revoked' | 'unreachable'
	plan?: string | null
	activatedAt?: string | null
	lastCheckedAt?: string | null
	lastError?: string | null
}

export interface GlobalSettings {
	/**
	 * Emails que recebem alertas de falha do sistema (`sendErrorAlert`).
	 * Quando vazio ou indefinido, fallback pra env var `ERROR_ALERT_RECIPIENTS`.
	 */
	errorAlertRecipients?: string[] | null
	/** Transporte de e-mail da instalação (open). Null = usa env/Postmark. */
	smtp?: SmtpSettings | null
	/** Licença do plugin Motor (open). Null = nenhuma chave configurada. */
	motorPlugin?: MotorPluginSettings | null
	updatedAt?: string | null
	updatedBy?: string | null
}
