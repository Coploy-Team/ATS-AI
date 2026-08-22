/**
 * Licença do plugin Motor — LADO COPLOY (ADR-008).
 *
 * O documento vive na instalação SaaS da Coploy (coleção `motorLicenses`);
 * a instância open só conhece a CHAVE, nunca este registro. O `id` é o
 * SHA-256 hex da chave — a chave em claro não é armazenada em lugar nenhum
 * do nosso lado (vazamento do banco não vaza licenças utilizáveis).
 *
 * Emissão na fase 1 é manual: `cplm_$(openssl rand -hex 24)`, documento
 * criado no console com o hash como id.
 */
export interface MotorLicense {
	/** SHA-256 hex da chave (`cplm_…`). */
	id: string
	/** Plano comercial contratado (rótulo livre na fase 1, ex. "starter"). */
	plan: string
	status: 'active' | 'revoked'
	/** Quem contratou — nome/e-mail da empresa, pra operação humana. */
	issuedTo: string
	notes?: string | null
	createdAt?: Date | string | null
	/** Último heartbeat de ativação — telemetria de instância viva. */
	lastSeenAt?: Date | string | null
	/** O que a instância declarou de si no último contato. */
	instance?: {
		url?: string | null
		version?: string | null
	} | null
}
