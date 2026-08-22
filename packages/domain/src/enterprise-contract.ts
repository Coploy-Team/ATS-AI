/**
 * Contrato Enterprise manual — clientes negociados fora do Stripe.
 *
 * Representa um período de vigência com valor mensal acordado e quota
 * opcional de entrevistas. Uma Company pode ter múltiplos contratos
 * históricos (renovações, reajustes), mas tipicamente apenas um com
 * `status === 'active'` por vez.
 *
 * Fonte da verdade para receita Enterprise no /admin/billing — soma
 * todos os contratos ativos para compor o MRR Enterprise.
 */
export type EnterpriseContractStatus = 'active' | 'paused' | 'ended'

export interface EnterpriseContract {
	id: string
	/** Ref ao doc da Company. */
	companyId: string
	/** Snapshot do nome da empresa no momento do cadastro (search-friendly). */
	companyName?: string | null
	/** Valor mensal acordado em "minor units" (centavos). */
	monthlyAmountMinor: number
	/** ISO 4217 — 'brl', 'usd', etc. */
	currency: string
	/** Quota de entrevistas/mês acordada. null = ilimitado. */
	interviewsQuota?: number | null
	/**
	 * Valor cobrado por entrevista que ultrapassar a quota mensal.
	 * Em "minor units" (centavos). null = sem cobrança de overage acordada.
	 */
	overageRateMinor?: number | null
	/**
	 * Dia do mês em que a fatura vence (1-28). Usado pra geração automática de
	 * baixas pendentes. null = sem dia fixo (suporte gera manualmente).
	 */
	billingDayOfMonth?: number | null
	/** Início da vigência (ISO). */
	startAt: Date | string
	/** Fim da vigência (ISO). null = sem fim definido. */
	endAt?: Date | string | null
	status: EnterpriseContractStatus
	/** Notas internas (cláusulas especiais, contato comercial, etc). */
	notes?: string | null
	createdAt: Date | string
	updatedAt?: Date | string | null
	/** Email do admin que criou o contrato. */
	createdBy: string
	/** Email do admin da última edição. */
	updatedBy?: string | null
}
