/**
 * Talent OS Credits Service (F0.3) — tipos de domínio.
 *
 * Isolado do créditos SaaS legado (`consumeCredit` / `Company.subscriptionCredits`).
 * Contrato: reserve → execute → capture | release | expiry.
 */

export type TalentCreditLedgerKind =
	| 'purchase'
	| 'grant'
	| 'reserve'
	| 'capture'
	| 'release'
	| 'refund'
	| 'expiry'
	| 'adjustment'

export type TalentCreditReservationStatus =
	| 'reserved'
	| 'captured'
	| 'released'
	| 'expired'

/** Catálogo seedável (C1–C18). Preços NÃO inventados — null até blueprint. */
export interface TalentCreditCatalogItem {
	id: string
	/** Código estável do item, ex.: "C1". */
	code: string
	name: string
	description?: string | null
	/**
	 * Custo em créditos (1 crédito = R$1 no modelo comercial).
	 * null = ainda não confirmado no blueprint v3.0.
	 * TODO(dev): confirmar no blueprint v3.0
	 */
	unitCostCredits?: number | null
	active?: boolean | null
	createdAt?: string | null
	updatedAt?: string | null
}

/**
 * Wallet por tenant (companyId). `budgetKey` modela sub-orçamento
 * (estabelecimento / centro de custo / usuário) sem UI nesta fase.
 */
export interface TalentCreditWallet {
	id: string
	companyId: string
	/** null = wallet raiz do tenant. */
	budgetKey?: string | null
	balanceAvailable: number
	balanceReserved: number
	createdAt?: string | null
	updatedAt?: string | null
}

export interface TalentCreditReservation {
	id: string
	companyId: string
	walletId: string
	catalogCode: string
	amount: number
	status: TalentCreditReservationStatus
	idempotencyKey: string
	/** Ref do objeto de negócio, ex.: "jobApplied:abc" / "invite:xyz". */
	objectRef?: string | null
	budgetKey?: string | null
	expiresAt: string
	capturedAt?: string | null
	releasedAt?: string | null
	expiredAt?: string | null
	createdAt?: string | null
	updatedAt?: string | null
}

/** Ledger append-only — nunca atualizar/apagar entradas existentes. */
export interface TalentCreditLedgerEntry {
	id: string
	companyId: string
	walletId: string
	kind: TalentCreditLedgerKind
	/**
	 * Magnitude positiva do movimento.
	 * O sentido (available↑/↓, reserved↑/↓) vem de `kind`.
	 */
	amount: number
	balanceAvailableAfter: number
	balanceReservedAfter: number
	catalogCode?: string | null
	reservationId?: string | null
	objectRef?: string | null
	idempotencyKey?: string | null
	meta?: Record<string, unknown> | null
	createdAt?: string | null
}
