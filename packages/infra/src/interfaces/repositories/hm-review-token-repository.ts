import type { HiringManagerReviewToken } from '@coploy/domain'

export type CreateHiringManagerReviewTokenInput = {
	companyId: string
	jobId: string
	jobAppliedIds: string[]
	createdByUserId?: string | null
	expiresAt: Date
}

export interface HiringManagerReviewTokenRepository {
	/** Emite um convite de review válido até `expiresAt`. */
	createReviewToken(
		code: string,
		input: CreateHiringManagerReviewTokenInput,
	): Promise<void>
	/**
	 * Resgata o convite **atomicamente**: só a primeira chamada com um código
	 * válido e não expirado devolve o token com `accessCode`; replay/corrida
	 * devolvem null.
	 */
	consumeReviewToken(code: string, accessCode: string, accessExpiresAt: Date): Promise<HiringManagerReviewToken | null>
	/** Resolve a sessão de acesso emitida no resgate (não consome de novo). */
	getByAccessCode(accessCode: string): Promise<HiringManagerReviewToken | null>
}
