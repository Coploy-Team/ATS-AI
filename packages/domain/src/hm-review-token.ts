/**
 * Token de review do hiring manager: link opaco para o gestor ver a shortlist
 * de uma vaga e registrar parecer, sem conta Coploy.
 *
 * Espelha o padrão de `InterviewHandoff`: ticket de alta entropia, TTL curto,
 * consumo atômico no resgate. Após o resgate, um `accessCode` separado autoriza
 * listagem e decisões até `accessExpiresAt` (sem OAuth).
 */
export interface HiringManagerReviewToken {
	/** Código de convite (URL) — queimado no primeiro resgate. */
	id: string
	companyId: string
	jobId: string
	/** Shortlist escopada: só estes jobAppliedIds podem ser listados/decididos. */
	jobAppliedIds: string[]
	createdByUserId?: string | null
	createdAt?: Date | null
	expiresAt?: Date | null
	/** Preenchido no resgate; presença marca o convite como queimado. */
	usedAt?: Date | null
	/** Código de acesso emitido no resgate (uso limitado até accessExpiresAt). */
	accessCode?: string | null
	accessExpiresAt?: Date | null
}
