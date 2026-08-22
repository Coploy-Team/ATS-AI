/**
 * Baixa de pagamento de um contrato Enterprise.
 *
 * Modelo: cada Enterprise tem um contrato que define valor mensal +
 * (opcional) cobrança de overage por entrevista que ultrapassar a quota.
 * No fim do mês, a operação registra um EnterprisePayment com:
 *  - snapshot do uso (entrevistas finalizadas)
 *  - cálculo automático: base + overage = total
 *  - valor final EDITÁVEL pra acomodar negociações ad-hoc (desconto,
 *    pagamento parcial, valor combinado fora da regra do contrato).
 *
 * Quando o pagamento é confirmado, marca status='paid' com data e método.
 * Receita Enterprise REAL = soma de EnterprisePayments pagos no mês.
 */
export type EnterprisePaymentStatus = 'pending' | 'paid' | 'cancelled'

export type EnterprisePaymentMethod =
	| 'pix'
	| 'boleto'
	| 'transferencia'
	| 'cartao'
	| 'outro'

export interface EnterprisePayment {
	id: string
	contractId: string
	companyId: string
	companyName?: string | null
	/** Período de referência no formato 'YYYY-MM'. */
	period: string
	/** Snapshot — entrevistas finalizadas no período. */
	interviewsCount: number
	/** Snapshot — quota mensal do contrato no momento do registro. */
	interviewsQuota?: number | null
	/** Valor do contrato (snapshot, em "minor units"). */
	baseAmountMinor: number
	/** Quantidade de entrevistas que excedeu a quota (max(0, used - quota)). */
	overageQuantity: number
	/** Valor por entrevista extra (snapshot do contrato). */
	overageRateMinor?: number | null
	/** Calculado: overageQuantity * overageRateMinor. */
	overageAmountMinor: number
	/**
	 * Valor final cobrado. Default = base + overage. EDITÁVEL pra cobrir
	 * negociações ad-hoc (regras mudam, desconto, etc).
	 */
	totalAmountMinor: number
	currency: string
	status: EnterprisePaymentStatus
	paidAt?: Date | string | null
	paidMethod?: EnterprisePaymentMethod | null
	notes?: string | null
	createdAt: Date | string
	updatedAt?: Date | string | null
	createdBy: string
	updatedBy?: string | null
}
