import { randomUUID } from 'node:crypto'
import type { Firestore, Transaction } from 'firebase-admin/firestore'
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

const CATALOG = 'talentCreditCatalog'
const WALLETS = 'talentCreditWallets'
const RESERVATIONS = 'talentCreditReservations'
const LEDGER = 'talentCreditLedger'

function normalizeBudgetKey(budgetKey?: string | null): string {
	return budgetKey?.trim() || ''
}

function toIso(value: unknown): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'object' && value !== null && 'toDate' in value) {
		const d = (value as { toDate: () => Date }).toDate()
		return d instanceof Date ? d.toISOString() : null
	}
	return null
}

function mapWallet(id: string, data: Record<string, unknown>): TalentCreditWallet {
	return {
		id,
		companyId: String(data.companyId),
		budgetKey: normalizeBudgetKey(
			typeof data.budgetKey === 'string' ? data.budgetKey : null,
		),
		balanceAvailable: Number(data.balanceAvailable ?? 0),
		balanceReserved: Number(data.balanceReserved ?? 0),
		createdAt: toIso(data.createdAt),
		updatedAt: toIso(data.updatedAt),
	}
}

function mapReservation(id: string, data: Record<string, unknown>): TalentCreditReservation {
	return {
		id,
		companyId: String(data.companyId),
		walletId: String(data.walletId),
		catalogCode: String(data.catalogCode),
		amount: Number(data.amount),
		status: data.status as TalentCreditReservation['status'],
		idempotencyKey: String(data.idempotencyKey),
		objectRef: (data.objectRef as string | null) ?? null,
		budgetKey: normalizeBudgetKey(
			typeof data.budgetKey === 'string' ? data.budgetKey : null,
		),
		expiresAt: toIso(data.expiresAt) ?? new Date(0).toISOString(),
		capturedAt: toIso(data.capturedAt),
		releasedAt: toIso(data.releasedAt),
		expiredAt: toIso(data.expiredAt),
		createdAt: toIso(data.createdAt),
		updatedAt: toIso(data.updatedAt),
	}
}

function mapLedger(id: string, data: Record<string, unknown>): TalentCreditLedgerEntry {
	return {
		id,
		companyId: String(data.companyId),
		walletId: String(data.walletId),
		kind: data.kind as TalentCreditLedgerEntry['kind'],
		amount: Number(data.amount),
		balanceAvailableAfter: Number(data.balanceAvailableAfter),
		balanceReservedAfter: Number(data.balanceReservedAfter),
		catalogCode: typeof data.catalogCode === 'string' ? data.catalogCode : null,
		reservationId: typeof data.reservationId === 'string' ? data.reservationId : null,
		objectRef: typeof data.objectRef === 'string' ? data.objectRef : null,
		idempotencyKey: typeof data.idempotencyKey === 'string' ? data.idempotencyKey : null,
		meta: (data.meta as Record<string, unknown> | null) ?? null,
		createdAt: toIso(data.createdAt),
	}
}

function mapCatalog(id: string, data: Record<string, unknown>): TalentCreditCatalogItem {
	return {
		id,
		code: String(data.code),
		name: String(data.name),
		description: typeof data.description === 'string' ? data.description : null,
		unitCostCredits:
			data.unitCostCredits === null || data.unitCostCredits === undefined
				? null
				: Number(data.unitCostCredits),
		active: typeof data.active === 'boolean' ? data.active : true,
		createdAt: toIso(data.createdAt),
		updatedAt: toIso(data.updatedAt),
	}
}

async function findWalletDoc(
	db: Firestore,
	tx: Transaction | null,
	companyId: string,
	budgetKey: string,
) {
	const query = db
		.collection(WALLETS)
		.where('companyId', '==', companyId)
		.where('budgetKey', '==', budgetKey)
		.limit(1)
	const snap = tx ? await tx.get(query) : await query.get()
	return snap.docs[0] ?? null
}

async function findReservationByKey(
	db: Firestore,
	tx: Transaction | null,
	companyId: string,
	idempotencyKey: string,
) {
	const query = db
		.collection(RESERVATIONS)
		.where('companyId', '==', companyId)
		.where('idempotencyKey', '==', idempotencyKey)
		.limit(1)
	const snap = tx ? await tx.get(query) : await query.get()
	return snap.docs[0] ?? null
}

async function findLedgerByKey(
	db: Firestore,
	tx: Transaction | null,
	companyId: string,
	idempotencyKey: string,
) {
	const query = db
		.collection(LEDGER)
		.where('companyId', '==', companyId)
		.where('idempotencyKey', '==', idempotencyKey)
		.limit(1)
	const snap = tx ? await tx.get(query) : await query.get()
	return snap.docs[0] ?? null
}

export function createFirestoreTalentCreditsRepository(db: Firestore): TalentCreditsRepository {
	return {
		async listCatalog() {
			const snap = await db.collection(CATALOG).get()
			return snap.docs.map((d) => mapCatalog(d.id, d.data()))
		},

		async getCatalogByCode(code) {
			const snap = await db.collection(CATALOG).where('code', '==', code).limit(1).get()
			const doc = snap.docs[0]
			return doc ? mapCatalog(doc.id, doc.data()) : null
		},

		async upsertCatalogItem(item) {
			const existing = await db.collection(CATALOG).where('code', '==', item.code).limit(1).get()
			const now = new Date()
			if (!existing.empty) {
				const doc = existing.docs[0]
				const payload = {
					code: item.code,
					name: item.name,
					description: item.description ?? null,
					unitCostCredits: item.unitCostCredits ?? null,
					active: item.active ?? true,
					updatedAt: now,
				}
				await doc.ref.update(payload)
				return mapCatalog(doc.id, { ...doc.data(), ...payload })
			}
			const id = item.id ?? randomUUID()
			const payload = {
				code: item.code,
				name: item.name,
				description: item.description ?? null,
				unitCostCredits: item.unitCostCredits ?? null,
				active: item.active ?? true,
				createdAt: now,
				updatedAt: now,
			}
			await db.collection(CATALOG).doc(id).set(payload)
			return mapCatalog(id, payload)
		},

		async seedCatalog(items) {
			const out: TalentCreditCatalogItem[] = []
			for (const item of items) {
				out.push(await this.upsertCatalogItem(item))
			}
			return out
		},

		async getWallet(companyId, budgetKey) {
			const doc = await findWalletDoc(db, null, companyId, normalizeBudgetKey(budgetKey))
			return doc ? mapWallet(doc.id, doc.data()) : null
		},

		async getOrCreateWallet(companyId, budgetKey) {
			const key = normalizeBudgetKey(budgetKey)
			const existing = await findWalletDoc(db, null, companyId, key)
			if (existing) return mapWallet(existing.id, existing.data())

			const id = randomUUID()
			const now = new Date()
			const payload = {
				companyId,
				budgetKey: key,
				balanceAvailable: 0,
				balanceReserved: 0,
				createdAt: now,
				updatedAt: now,
			}
			try {
				await db.collection(WALLETS).doc(id).set(payload)
				return mapWallet(id, payload)
			} catch {
				const raced = await findWalletDoc(db, null, companyId, key)
				if (raced) return mapWallet(raced.id, raced.data())
				throw new Error('Failed to create talent credit wallet')
			}
		},

		async listLedger(companyId, params = {}) {
			const limit = Math.min(Math.max(Math.trunc(params.limit ?? 50), 1), 100)
			const offset = Math.max(Number.parseInt(params.cursor ?? '0', 10) || 0, 0)
			const snap = await db
				.collection(LEDGER)
				.where('companyId', '==', companyId)
				.orderBy('createdAt', 'desc')
				.offset(offset)
				.limit(limit + 1)
				.get()
			const docs = snap.docs.slice(0, limit)
			return {
				items: docs.map((d) => mapLedger(d.id, d.data())),
				nextCursor: snap.docs.length > limit ? String(offset + limit) : null,
			}
		},

		async getReservation(id) {
			const doc = await db.collection(RESERVATIONS).doc(id).get()
			if (!doc.exists) return null
			return mapReservation(doc.id, doc.data()!)
		},

		async findReservationByIdempotencyKey(companyId, idempotencyKey) {
			const doc = await findReservationByKey(db, null, companyId, idempotencyKey)
			return doc ? mapReservation(doc.id, doc.data()) : null
		},

		async listExpiredReservations(now, limit = 100) {
			const snap = await db
				.collection(RESERVATIONS)
				.where('status', '==', 'reserved')
				.where('expiresAt', '<=', now)
				.limit(limit)
				.get()
			return snap.docs.map((d) => mapReservation(d.id, d.data()))
		},

		async grant(input: TalentCreditsGrantInput): Promise<TalentCreditsMutationResult> {
			const budgetKey = normalizeBudgetKey(input.budgetKey)
			const kind = input.kind ?? 'grant'
			if (input.amount <= 0) throw new Error('Grant amount must be positive')

			return db.runTransaction(async (tx) => {
				const existingLedger = await findLedgerByKey(db, tx, input.companyId, input.idempotencyKey)
				if (existingLedger) {
					const ledger = mapLedger(existingLedger.id, existingLedger.data())
					const walletDoc = await tx.get(db.collection(WALLETS).doc(ledger.walletId))
					const wallet = walletDoc.exists
						? mapWallet(walletDoc.id, walletDoc.data()!)
						: await ensureWalletInTx(db, tx, input.companyId, budgetKey)
					return { wallet, ledgerEntry: ledger, alreadyExists: true }
				}

				const wallet = await ensureWalletInTx(db, tx, input.companyId, budgetKey)
				const walletRef = db.collection(WALLETS).doc(wallet.id)
				const now = new Date()
				const balanceAvailable = wallet.balanceAvailable + input.amount
				const balanceReserved = wallet.balanceReserved

				tx.update(walletRef, {
					balanceAvailable,
					balanceReserved,
					updatedAt: now,
				})

				const ledgerId = randomUUID()
				const ledgerPayload = {
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
				tx.set(db.collection(LEDGER).doc(ledgerId), ledgerPayload)

				return {
					wallet: {
						...wallet,
						balanceAvailable,
						balanceReserved,
						updatedAt: now.toISOString(),
					},
					ledgerEntry: mapLedger(ledgerId, ledgerPayload),
					alreadyExists: false,
				}
			})
		},

		async reserve(input: TalentCreditsReserveInput): Promise<TalentCreditsMutationResult> {
			const budgetKey = normalizeBudgetKey(input.budgetKey)
			if (input.amount <= 0) throw new Error('Reserve amount must be positive')

			return db.runTransaction(async (tx) => {
				const existing = await findReservationByKey(
					db,
					tx,
					input.companyId,
					input.idempotencyKey,
				)
				if (existing) {
					const reservation = mapReservation(existing.id, existing.data())
					const walletDoc = await tx.get(db.collection(WALLETS).doc(reservation.walletId))
					const wallet = walletDoc.exists
						? mapWallet(walletDoc.id, walletDoc.data()!)
						: await ensureWalletInTx(db, tx, input.companyId, budgetKey)
					const ledgerSnap = await tx.get(
						db
							.collection(LEDGER)
							.where('reservationId', '==', reservation.id)
							.where('kind', '==', 'reserve')
							.limit(1),
					)
					const ledgerDoc = ledgerSnap.docs[0]
					const ledgerEntry = ledgerDoc
						? mapLedger(ledgerDoc.id, ledgerDoc.data())
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
							}
					return { wallet, reservation, ledgerEntry, alreadyExists: true }
				}

				const wallet = await ensureWalletInTx(db, tx, input.companyId, budgetKey)
				if (wallet.balanceAvailable < input.amount) {
					throw new Error('Insufficient talent credits')
				}

				const now = new Date()
				const balanceAvailable = wallet.balanceAvailable - input.amount
				const balanceReserved = wallet.balanceReserved + input.amount
				const walletRef = db.collection(WALLETS).doc(wallet.id)
				tx.update(walletRef, { balanceAvailable, balanceReserved, updatedAt: now })

				const reservationId = randomUUID()
				const reservationPayload = {
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
				tx.set(db.collection(RESERVATIONS).doc(reservationId), reservationPayload)

				const ledgerId = randomUUID()
				const ledgerPayload = {
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
				tx.set(db.collection(LEDGER).doc(ledgerId), ledgerPayload)

				return {
					wallet: {
						...wallet,
						balanceAvailable,
						balanceReserved,
						updatedAt: now.toISOString(),
					},
					reservation: mapReservation(reservationId, reservationPayload),
					ledgerEntry: mapLedger(ledgerId, ledgerPayload),
					alreadyExists: false,
				}
			})
		},

		async capture(reservationId) {
			return finalizeReservation(db, reservationId, 'capture')
		},

		async release(reservationId) {
			return finalizeReservation(db, reservationId, 'release')
		},

		async expire(reservationId) {
			return finalizeReservation(db, reservationId, 'expiry')
		},
	}
}

async function ensureWalletInTx(
	db: Firestore,
	tx: Transaction,
	companyId: string,
	budgetKey: string,
): Promise<TalentCreditWallet> {
	const existing = await findWalletDoc(db, tx, companyId, budgetKey)
	if (existing) return mapWallet(existing.id, existing.data())

	const id = randomUUID()
	const now = new Date()
	const payload = {
		companyId,
		budgetKey,
		balanceAvailable: 0,
		balanceReserved: 0,
		createdAt: now,
		updatedAt: now,
	}
	tx.set(db.collection(WALLETS).doc(id), payload)
	return mapWallet(id, payload)
}

async function finalizeReservation(
	db: Firestore,
	reservationId: string,
	action: 'capture' | 'release' | 'expiry',
): Promise<TalentCreditsMutationResult> {
	const terminalStatus =
		action === 'capture' ? 'captured' : action === 'release' ? 'released' : 'expired'
	const ledgerKind = action === 'capture' ? 'capture' : action === 'release' ? 'release' : 'expiry'

	return db.runTransaction(async (tx) => {
		const reservationRef = db.collection(RESERVATIONS).doc(reservationId)
		const reservationSnap = await tx.get(reservationRef)
		if (!reservationSnap.exists) throw new Error('Reservation not found')

		const reservation = mapReservation(reservationSnap.id, reservationSnap.data()!)
		const walletRef = db.collection(WALLETS).doc(reservation.walletId)
		const walletSnap = await tx.get(walletRef)
		if (!walletSnap.exists) throw new Error('Wallet not found')
		const wallet = mapWallet(walletSnap.id, walletSnap.data()!)

		if (reservation.status === terminalStatus) {
			const ledgerSnap = await tx.get(
				db
					.collection(LEDGER)
					.where('reservationId', '==', reservationId)
					.where('kind', '==', ledgerKind)
					.limit(1),
			)
			const ledgerDoc = ledgerSnap.docs[0]
			return {
				wallet,
				reservation,
				ledgerEntry: ledgerDoc
					? mapLedger(ledgerDoc.id, ledgerDoc.data())
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
			if (balanceReserved < 0) throw new Error('Reserved balance underflow')
		} else {
			balanceReserved = wallet.balanceReserved - reservation.amount
			balanceAvailable = wallet.balanceAvailable + reservation.amount
			if (balanceReserved < 0) throw new Error('Reserved balance underflow')
		}

		const reservationPatch: Record<string, unknown> = {
			status: terminalStatus,
			updatedAt: now,
		}
		if (action === 'capture') reservationPatch.capturedAt = now
		if (action === 'release') reservationPatch.releasedAt = now
		if (action === 'expiry') reservationPatch.expiredAt = now

		tx.update(walletRef, { balanceAvailable, balanceReserved, updatedAt: now })
		tx.update(reservationRef, reservationPatch)

		const ledgerId = randomUUID()
		const ledgerPayload = {
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
		tx.set(db.collection(LEDGER).doc(ledgerId), ledgerPayload)

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
			ledgerEntry: mapLedger(ledgerId, ledgerPayload),
			alreadyExists: false,
		}
	})
}
