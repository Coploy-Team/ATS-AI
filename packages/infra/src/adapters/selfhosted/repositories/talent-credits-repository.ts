import { and, desc, eq, lte } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type {
	TalentCreditCatalogItem,
	TalentCreditLedgerEntry,
	TalentCreditReservation,
	TalentCreditWallet,
} from '@coploy/domain'
import type {
	TalentCreditsGrantInput,
	TalentCreditsMutationResult,
	TalentCreditsRepository,
	TalentCreditsReserveInput,
} from '../../../interfaces/repositories/talent-credits-repository'
import type { DrizzleDb } from '../db/client'
import { schema } from './helpers'

function normalizeBudgetKey(budgetKey?: string | null): string {
	return budgetKey?.trim() || ''
}

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	return value.toISOString()
}

function mapWallet(row: typeof schema.talentCreditWallets.$inferSelect): TalentCreditWallet {
	return {
		id: row.id,
		companyId: row.companyId,
		budgetKey: normalizeBudgetKey(row.budgetKey),
		balanceAvailable: row.balanceAvailable,
		balanceReserved: row.balanceReserved,
		createdAt: toIso(row.createdAt),
		updatedAt: toIso(row.updatedAt),
	}
}

function mapReservation(
	row: typeof schema.talentCreditReservations.$inferSelect,
): TalentCreditReservation {
	return {
		id: row.id,
		companyId: row.companyId,
		walletId: row.walletId,
		catalogCode: row.catalogCode,
		amount: row.amount,
		status: row.status as TalentCreditReservation['status'],
		idempotencyKey: row.idempotencyKey,
		objectRef: row.objectRef ?? null,
		budgetKey: normalizeBudgetKey(row.budgetKey),
		expiresAt: toIso(row.expiresAt) ?? new Date(0).toISOString(),
		capturedAt: toIso(row.capturedAt),
		releasedAt: toIso(row.releasedAt),
		expiredAt: toIso(row.expiredAt),
		createdAt: toIso(row.createdAt),
		updatedAt: toIso(row.updatedAt),
	}
}

function mapLedger(row: typeof schema.talentCreditLedger.$inferSelect): TalentCreditLedgerEntry {
	return {
		id: row.id,
		companyId: row.companyId,
		walletId: row.walletId,
		kind: row.kind as TalentCreditLedgerEntry['kind'],
		amount: row.amount,
		balanceAvailableAfter: row.balanceAvailableAfter,
		balanceReservedAfter: row.balanceReservedAfter,
		catalogCode: row.catalogCode ?? null,
		reservationId: row.reservationId ?? null,
		objectRef: row.objectRef ?? null,
		idempotencyKey: row.idempotencyKey ?? null,
		meta: (row.meta as Record<string, unknown> | null) ?? null,
		createdAt: toIso(row.createdAt),
	}
}

function mapCatalog(row: typeof schema.talentCreditCatalog.$inferSelect): TalentCreditCatalogItem {
	return {
		id: row.id,
		code: row.code,
		name: row.name,
		description: row.description ?? null,
		unitCostCredits: row.unitCostCredits ?? null,
		active: row.active ?? true,
		createdAt: toIso(row.createdAt),
		updatedAt: toIso(row.updatedAt),
	}
}

export function createDrizzleTalentCreditsRepository(db: DrizzleDb): TalentCreditsRepository {
	async function loadWallet(
		tx: DrizzleDb,
		companyId: string,
		budgetKey: string,
	): Promise<TalentCreditWallet | null> {
		const rows = await tx
			.select()
			.from(schema.talentCreditWallets)
			.where(
				and(
					eq(schema.talentCreditWallets.companyId, companyId),
					eq(schema.talentCreditWallets.budgetKey, budgetKey),
				),
			)
			.limit(1)
		return rows[0] ? mapWallet(rows[0]) : null
	}

	async function ensureWallet(
		tx: DrizzleDb,
		companyId: string,
		budgetKey: string,
	): Promise<TalentCreditWallet> {
		const existing = await loadWallet(tx, companyId, budgetKey)
		if (existing) return existing
		const id = randomUUID()
		const now = new Date()
		await tx.insert(schema.talentCreditWallets).values({
			id,
			companyId,
			budgetKey,
			balanceAvailable: 0,
			balanceReserved: 0,
			createdAt: now,
			updatedAt: now,
		})
		return {
			id,
			companyId,
			budgetKey,
			balanceAvailable: 0,
			balanceReserved: 0,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
		}
	}

	async function finalize(
		reservationId: string,
		action: 'capture' | 'release' | 'expiry',
	): Promise<TalentCreditsMutationResult> {
		const terminalStatus =
			action === 'capture' ? 'captured' : action === 'release' ? 'released' : 'expired'
		const ledgerKind = action === 'capture' ? 'capture' : action === 'release' ? 'release' : 'expiry'

		return db.transaction(async (tx) => {
			const rows = await tx
				.select()
				.from(schema.talentCreditReservations)
				.where(eq(schema.talentCreditReservations.id, reservationId))
				.limit(1)
			if (!rows[0]) throw new Error('Reservation not found')
			const reservation = mapReservation(rows[0])

			const walletRows = await tx
				.select()
				.from(schema.talentCreditWallets)
				.where(eq(schema.talentCreditWallets.id, reservation.walletId))
				.limit(1)
			if (!walletRows[0]) throw new Error('Wallet not found')
			const wallet = mapWallet(walletRows[0])

			if (reservation.status === terminalStatus) {
				const ledgerRows = await tx
					.select()
					.from(schema.talentCreditLedger)
					.where(
						and(
							eq(schema.talentCreditLedger.reservationId, reservationId),
							eq(schema.talentCreditLedger.kind, ledgerKind),
						),
					)
					.limit(1)
				return {
					wallet,
					reservation,
					ledgerEntry: ledgerRows[0]
						? mapLedger(ledgerRows[0])
						: {
								id: 'idempotent',
								companyId: reservation.companyId,
								walletId: wallet.id,
								kind: ledgerKind,
								amount: reservation.amount,
								balanceAvailableAfter: wallet.balanceAvailable,
								balanceReservedAfter: wallet.balanceReserved,
								reservationId,
								createdAt: reservation.updatedAt,
							},
					alreadyExists: true,
				}
			}

			if (reservation.status !== 'reserved') {
				throw new Error(`Reservation is ${reservation.status}, cannot ${action}`)
			}

			const now = new Date()
			let balanceAvailable = wallet.balanceAvailable
			let balanceReserved = wallet.balanceReserved

			if (action === 'capture') {
				balanceReserved = wallet.balanceReserved - reservation.amount
			} else {
				balanceReserved = wallet.balanceReserved - reservation.amount
				balanceAvailable = wallet.balanceAvailable + reservation.amount
			}
			if (balanceReserved < 0) throw new Error('Reserved balance underflow')

			await tx
				.update(schema.talentCreditWallets)
				.set({ balanceAvailable, balanceReserved, updatedAt: now })
				.where(eq(schema.talentCreditWallets.id, wallet.id))

			await tx
				.update(schema.talentCreditReservations)
				.set({
					status: terminalStatus,
					updatedAt: now,
					capturedAt: action === 'capture' ? now : rows[0].capturedAt,
					releasedAt: action === 'release' ? now : rows[0].releasedAt,
					expiredAt: action === 'expiry' ? now : rows[0].expiredAt,
				})
				.where(eq(schema.talentCreditReservations.id, reservationId))

			const ledgerId = randomUUID()
			const ledgerValues = {
				id: ledgerId,
				companyId: reservation.companyId,
				walletId: wallet.id,
				kind: ledgerKind,
				amount: reservation.amount,
				balanceAvailableAfter: balanceAvailable,
				balanceReservedAfter: balanceReserved,
				catalogCode: reservation.catalogCode,
				reservationId,
				objectRef: reservation.objectRef ?? null,
				idempotencyKey: `${ledgerKind}:${reservationId}`,
				meta: null,
				createdAt: now,
			}
			await tx.insert(schema.talentCreditLedger).values(ledgerValues)

			return {
				wallet: {
					...wallet,
					balanceAvailable,
					balanceReserved,
					updatedAt: now.toISOString(),
				},
				reservation: {
					...reservation,
					status: terminalStatus,
					capturedAt: action === 'capture' ? now.toISOString() : reservation.capturedAt,
					releasedAt: action === 'release' ? now.toISOString() : reservation.releasedAt,
					expiredAt: action === 'expiry' ? now.toISOString() : reservation.expiredAt,
					updatedAt: now.toISOString(),
				},
				ledgerEntry: mapLedger(ledgerValues as typeof schema.talentCreditLedger.$inferSelect),
				alreadyExists: false,
			}
		})
	}

	return {
		async listCatalog() {
			const rows = await db.select().from(schema.talentCreditCatalog)
			return rows.map(mapCatalog)
		},

		async getCatalogByCode(code) {
			const rows = await db
				.select()
				.from(schema.talentCreditCatalog)
				.where(eq(schema.talentCreditCatalog.code, code))
				.limit(1)
			return rows[0] ? mapCatalog(rows[0]) : null
		},

		async upsertCatalogItem(item) {
			const existing = await db
				.select()
				.from(schema.talentCreditCatalog)
				.where(eq(schema.talentCreditCatalog.code, item.code))
				.limit(1)
			const now = new Date()
			if (existing[0]) {
				await db
					.update(schema.talentCreditCatalog)
					.set({
						name: item.name,
						description: item.description ?? null,
						unitCostCredits: item.unitCostCredits ?? null,
						active: item.active ?? true,
						updatedAt: now,
					})
					.where(eq(schema.talentCreditCatalog.id, existing[0].id))
				return mapCatalog({
					...existing[0],
					name: item.name,
					description: item.description ?? null,
					unitCostCredits: item.unitCostCredits ?? null,
					active: item.active ?? true,
					updatedAt: now,
				})
			}
			const id = item.id ?? randomUUID()
			const row = {
				id,
				code: item.code,
				name: item.name,
				description: item.description ?? null,
				unitCostCredits: item.unitCostCredits ?? null,
				active: item.active ?? true,
				createdAt: now,
				updatedAt: now,
			}
			await db.insert(schema.talentCreditCatalog).values(row)
			return mapCatalog(row)
		},

		async seedCatalog(items) {
			const out: TalentCreditCatalogItem[] = []
			for (const item of items) {
				out.push(await this.upsertCatalogItem(item))
			}
			return out
		},

		async getWallet(companyId, budgetKey) {
			return loadWallet(db, companyId, normalizeBudgetKey(budgetKey))
		},

		async getOrCreateWallet(companyId, budgetKey) {
			return ensureWallet(db, companyId, normalizeBudgetKey(budgetKey))
		},

		async listLedger(companyId, params = {}) {
			const limit = Math.min(Math.max(Math.trunc(params.limit ?? 50), 1), 100)
			const offset = Math.max(Number.parseInt(params.cursor ?? '0', 10) || 0, 0)
			const rows = await db
				.select()
				.from(schema.talentCreditLedger)
				.where(eq(schema.talentCreditLedger.companyId, companyId))
				.orderBy(desc(schema.talentCreditLedger.createdAt))
				.limit(limit + 1)
				.offset(offset)
			return {
				items: rows.slice(0, limit).map(mapLedger),
				nextCursor: rows.length > limit ? String(offset + limit) : null,
			}
		},

		async getReservation(id) {
			const rows = await db
				.select()
				.from(schema.talentCreditReservations)
				.where(eq(schema.talentCreditReservations.id, id))
				.limit(1)
			return rows[0] ? mapReservation(rows[0]) : null
		},

		async findReservationByIdempotencyKey(companyId, idempotencyKey) {
			const rows = await db
				.select()
				.from(schema.talentCreditReservations)
				.where(
					and(
						eq(schema.talentCreditReservations.companyId, companyId),
						eq(schema.talentCreditReservations.idempotencyKey, idempotencyKey),
					),
				)
				.limit(1)
			return rows[0] ? mapReservation(rows[0]) : null
		},

		async listExpiredReservations(now, limit = 100) {
			const rows = await db
				.select()
				.from(schema.talentCreditReservations)
				.where(
					and(
						eq(schema.talentCreditReservations.status, 'reserved'),
						lte(schema.talentCreditReservations.expiresAt, now),
					),
				)
				.limit(limit)
			return rows.map(mapReservation)
		},

		async grant(input: TalentCreditsGrantInput): Promise<TalentCreditsMutationResult> {
			const budgetKey = normalizeBudgetKey(input.budgetKey)
			const kind = input.kind ?? 'grant'
			if (input.amount <= 0) throw new Error('Grant amount must be positive')

			return db.transaction(async (tx) => {
				const existingLedger = await tx
					.select()
					.from(schema.talentCreditLedger)
					.where(
						and(
							eq(schema.talentCreditLedger.companyId, input.companyId),
							eq(schema.talentCreditLedger.idempotencyKey, input.idempotencyKey),
						),
					)
					.limit(1)
				if (existingLedger[0]) {
					const ledger = mapLedger(existingLedger[0])
					const wallet =
						(await loadWallet(tx as unknown as DrizzleDb, input.companyId, budgetKey)) ??
						(await ensureWallet(tx as unknown as DrizzleDb, input.companyId, budgetKey))
					return { wallet, ledgerEntry: ledger, alreadyExists: true }
				}

				const wallet = await ensureWallet(tx as unknown as DrizzleDb, input.companyId, budgetKey)
				const now = new Date()
				const balanceAvailable = wallet.balanceAvailable + input.amount
				const balanceReserved = wallet.balanceReserved

				await tx
					.update(schema.talentCreditWallets)
					.set({ balanceAvailable, balanceReserved, updatedAt: now })
					.where(eq(schema.talentCreditWallets.id, wallet.id))

				const ledgerId = randomUUID()
				const ledgerValues = {
					id: ledgerId,
					companyId: input.companyId,
					walletId: wallet.id,
					kind,
					amount: input.amount,
					balanceAvailableAfter: balanceAvailable,
					balanceReservedAfter: balanceReserved,
					catalogCode: null,
					reservationId: null,
					objectRef: null,
					idempotencyKey: input.idempotencyKey,
					meta: input.meta ?? null,
					createdAt: now,
				}
				await tx.insert(schema.talentCreditLedger).values(ledgerValues)

				return {
					wallet: {
						...wallet,
						balanceAvailable,
						balanceReserved,
						updatedAt: now.toISOString(),
					},
					ledgerEntry: mapLedger(ledgerValues as typeof schema.talentCreditLedger.$inferSelect),
					alreadyExists: false,
				}
			})
		},

		async reserve(input: TalentCreditsReserveInput): Promise<TalentCreditsMutationResult> {
			const budgetKey = normalizeBudgetKey(input.budgetKey)
			if (input.amount <= 0) throw new Error('Reserve amount must be positive')

			return db.transaction(async (tx) => {
				const existing = await tx
					.select()
					.from(schema.talentCreditReservations)
					.where(
						and(
							eq(schema.talentCreditReservations.companyId, input.companyId),
							eq(schema.talentCreditReservations.idempotencyKey, input.idempotencyKey),
						),
					)
					.limit(1)
				if (existing[0]) {
					const reservation = mapReservation(existing[0])
					const wallet =
						(await loadWallet(tx as unknown as DrizzleDb, input.companyId, budgetKey)) ??
						(await ensureWallet(tx as unknown as DrizzleDb, input.companyId, budgetKey))
					const ledgerRows = await tx
						.select()
						.from(schema.talentCreditLedger)
						.where(
							and(
								eq(schema.talentCreditLedger.reservationId, reservation.id),
								eq(schema.talentCreditLedger.kind, 'reserve'),
							),
						)
						.limit(1)
					return {
						wallet,
						reservation,
						ledgerEntry: ledgerRows[0]
							? mapLedger(ledgerRows[0])
							: {
									id: 'idempotent',
									companyId: input.companyId,
									walletId: wallet.id,
									kind: 'reserve' as const,
									amount: reservation.amount,
									balanceAvailableAfter: wallet.balanceAvailable,
									balanceReservedAfter: wallet.balanceReserved,
									reservationId: reservation.id,
									idempotencyKey: input.idempotencyKey,
									createdAt: reservation.createdAt,
								},
						alreadyExists: true,
					}
				}

				const wallet = await ensureWallet(tx as unknown as DrizzleDb, input.companyId, budgetKey)
				if (wallet.balanceAvailable < input.amount) {
					throw new Error('Insufficient talent credits')
				}

				const now = new Date()
				const balanceAvailable = wallet.balanceAvailable - input.amount
				const balanceReserved = wallet.balanceReserved + input.amount

				await tx
					.update(schema.talentCreditWallets)
					.set({ balanceAvailable, balanceReserved, updatedAt: now })
					.where(eq(schema.talentCreditWallets.id, wallet.id))

				const reservationId = randomUUID()
				const reservationValues = {
					id: reservationId,
					companyId: input.companyId,
					walletId: wallet.id,
					catalogCode: input.catalogCode,
					amount: input.amount,
					status: 'reserved',
					idempotencyKey: input.idempotencyKey,
					objectRef: input.objectRef ?? null,
					budgetKey,
					expiresAt: input.expiresAt,
					capturedAt: null,
					releasedAt: null,
					expiredAt: null,
					createdAt: now,
					updatedAt: now,
				}
				await tx.insert(schema.talentCreditReservations).values(reservationValues)

				const ledgerId = randomUUID()
				const ledgerValues = {
					id: ledgerId,
					companyId: input.companyId,
					walletId: wallet.id,
					kind: 'reserve',
					amount: input.amount,
					balanceAvailableAfter: balanceAvailable,
					balanceReservedAfter: balanceReserved,
					catalogCode: input.catalogCode,
					reservationId,
					objectRef: input.objectRef ?? null,
					idempotencyKey: input.idempotencyKey,
					meta: null,
					createdAt: now,
				}
				await tx.insert(schema.talentCreditLedger).values(ledgerValues)

				return {
					wallet: {
						...wallet,
						balanceAvailable,
						balanceReserved,
						updatedAt: now.toISOString(),
					},
					reservation: mapReservation(
						reservationValues as typeof schema.talentCreditReservations.$inferSelect,
					),
					ledgerEntry: mapLedger(ledgerValues as typeof schema.talentCreditLedger.$inferSelect),
					alreadyExists: false,
				}
			})
		},

		async capture(reservationId) {
			return finalize(reservationId, 'capture')
		},

		async release(reservationId) {
			return finalize(reservationId, 'release')
		},

		async expire(reservationId) {
			return finalize(reservationId, 'expiry')
		},
	}
}
