/**
 * Consentimento e retenção (LGPD — V2-701).
 *
 * A LGPD não trata consentimento como caixinha marcada uma vez: ele tem
 * finalidade, prazo e pode ser revogado. Modelar isso como `boolean` no cadastro
 * seria registrar que a pessoa concordou — sem registrar **com o quê**, **por
 * quanto tempo** e **se ainda concorda**, que é justamente o que se precisa
 * provar quando a pergunta chega.
 */

/** Finalidades separadas: aceitar participar de um processo não é aceitar virar base de marketing. */
export const CONSENT_PURPOSES = [
	/** Participar de processos seletivos desta empresa. */
	'recruitment',
	/** Ficar no banco de talentos para vagas futuras. */
	'talent_pool',
	/** Receber comunicações não relacionadas a um processo em andamento. */
	'marketing',
] as const

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number]

export interface ConsentRecord {
	id: string
	/** Titular do dado (uid de `users/{id}`). */
	userId: string
	/** Empresa controladora. Null = consentimento dado à própria Coploy. */
	companyId?: string | null
	purpose: ConsentPurpose
	granted: boolean
	grantedAt?: Date | string | null
	/** Quando expira. Consentimento sem prazo é o que a lei não aceita. */
	expiresAt?: Date | string | null
	revokedAt?: Date | string | null
	/** Texto exato aceito — a versão importa quando a política muda. */
	policyVersion?: string | null
	/** Origem do aceite: `careers`, `interview`, `mcp`, `import`. */
	source?: string | null
	createdAt?: Date | string | null
}

/**
 * Operação sobre dado pessoal, registrada para auditoria.
 *
 * O registro é o que transforma "nós apagamos" em prova. Sem ele, atender a um
 * pedido de exclusão e não conseguir demonstrar isso é o mesmo, do ponto de
 * vista de fiscalização, que não ter atendido.
 */
export const DATA_SUBJECT_OPERATIONS = [
	'export',
	'deletion',
	'anonymization',
	'consent_granted',
	'consent_revoked',
	'retention_anonymized',
] as const

export type DataSubjectOperation = (typeof DATA_SUBJECT_OPERATIONS)[number]

export interface DataSubjectRequest {
	id: string
	userId: string
	companyId?: string | null
	operation: DataSubjectOperation
	/** `pending` só existe para o que depende de processamento assíncrono. */
	status: 'pending' | 'completed' | 'failed'
	requestedAt: Date | string
	completedAt?: Date | string | null
	/** Quem pediu: o próprio titular, o admin da empresa, ou o cron. */
	requestedBy?: string | null
	/** Contagem do que foi afetado — evidência sem PII. */
	affected?: Record<string, number> | null
	error?: string | null
}

/**
 * Política de retenção por empresa.
 *
 * Prazo em dias contados da ÚLTIMA interação, não da criação: a pessoa que
 * voltou a se candidatar mês passado não tem dado "velho" só porque o primeiro
 * cadastro é de 2021.
 */
export interface RetentionPolicy {
	/** Dias até anonimizar candidatura sem movimentação. `null` = não anonimiza. */
	candidateRetentionDays?: number | null
	/** Dias de validade do consentimento de banco de talentos. */
	talentPoolConsentDays?: number | null
	/** Versão da política de privacidade vigente. */
	policyVersion?: string | null
	updatedAt?: Date | string | null
}

/** Default legal-conservador: 2 anos, que é o prazo comum de processo trabalhista. */
export const DEFAULT_CANDIDATE_RETENTION_DAYS = 730

/** Prazo legal da LGPD para responder ao titular (Art. 19, §II). */
export const LGPD_RESPONSE_DEADLINE_DAYS = 15
