import type {
	TalentCreditCatalogItem,
	TalentCreditLedgerEntry,
	TalentCreditLedgerKind,
	TalentCreditReservation,
	TalentCreditReservationStatus,
	TalentCreditWallet,
} from '@coploy/domain'

export type TalentCreditsReserveInput = {
	companyId: string
	budgetKey?: string | null
	catalogCode: string
	amount: number
	idempotencyKey: string
	objectRef?: string | null
	expiresAt: Date
}

export type TalentCreditsGrantInput = {
	companyId: string
	budgetKey?: string | null
	amount: number
	idempotencyKey: string
	kind?: Extract<TalentCreditLedgerKind, 'grant' | 'purchase' | 'adjustment' | 'refund'>
	meta?: Record<string, unknown> | null
}

export type TalentCreditsMutationResult = {
	wallet: TalentCreditWallet
	reservation?: TalentCreditReservation
	ledgerEntry: TalentCreditLedgerEntry
	alreadyExists: boolean
}

export type TalentCreditsLedgerPage = {
	items: TalentCreditLedgerEntry[]
	nextCursor: string | null
}

export interface TalentCreditsRepository {
	listCatalog(): Promise<TalentCreditCatalogItem[]>
	getCatalogByCode(code: string): Promise<TalentCreditCatalogItem | null>
	/** Upsert por `code`. Seedável; não inventa preços. */
	upsertCatalogItem(
		item: Omit<TalentCreditCatalogItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
	): Promise<TalentCreditCatalogItem>
	seedCatalog(
		items: Array<Omit<TalentCreditCatalogItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }>,
	): Promise<TalentCreditCatalogItem[]>

	getWallet(companyId: string, budgetKey?: string | null): Promise<TalentCreditWallet | null>
	getOrCreateWallet(companyId: string, budgetKey?: string | null): Promise<TalentCreditWallet>
	listLedger(
		companyId: string,
		params?: { limit?: number; cursor?: string | null },
	): Promise<TalentCreditsLedgerPage>

	getReservation(id: string): Promise<TalentCreditReservation | null>
	findReservationByIdempotencyKey(
		companyId: string,
		idempotencyKey: string,
	): Promise<TalentCreditReservation | null>
	listExpiredReservations(now: Date, limit?: number): Promise<TalentCreditReservation[]>

	/** Credita available (grant/purchase/refund/adjustment+). Idempotente por key. */
	grant(input: TalentCreditsGrantInput): Promise<TalentCreditsMutationResult>

	/** available → reserved. Idempotente por key. */
	reserve(input: TalentCreditsReserveInput): Promise<TalentCreditsMutationResult>

	/** reserved → consumido (sai do reserved). Idempotente se já captured. */
	capture(reservationId: string): Promise<TalentCreditsMutationResult>

	/** reserved → available. Idempotente se já released. */
	release(reservationId: string): Promise<TalentCreditsMutationResult>

	/** reserved → available via expiry. Idempotente se já expired/terminal. */
	expire(reservationId: string): Promise<TalentCreditsMutationResult>
}

export type { TalentCreditReservationStatus }
