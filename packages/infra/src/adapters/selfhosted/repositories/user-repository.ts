import type { CandidateProfile, User, UsersCompany } from '@coploy/domain'
import type { UserRepository } from '../../../interfaces/repositories/user-repository'
import type { DrizzleDb } from '../db/client'
import { UsersCompanyRepositorySchema, UserRepositorySchema } from '../../shared/repository-schemas'
import {
	applyPatch, cleanForDb, eq, postProcess,
	randomUUID, schema,
	toJsonSafe,
	cast,
	castWithSchema,
} from './helpers'

function decomposeUsersCompany(doc: Record<string, unknown>): Record<string, unknown> {
	const out = { ...doc }
	const company = doc.company
	if (company && typeof company === 'object' && 'id' in company) {
		out.company_id = (company as { id: unknown }).id
	} else if (typeof company === 'string' && company) {
		// company-free-service manda o id como string (não como ref) — sem este
		// ramo o vínculo era descartado e o usuário nascia sem empresa (401
		// "Company not found" em toda rota autenticada).
		out.company_id = company
	}
	delete out.company
	return out
}

const USER_NEST_KEYS = new Set([
	'stripeCustomerId', 'paymentPaid', 'paymentPaidDate', 'paymentMessageError', 'paymentDateError',
	'dreamJobId', 'dreamJobAppliedId', 'dreamJobCreatedAt', 'dreamJobStatus', 'dreamJobCompletedAt', 'dreamJobGeneralFeedback',
])

function assembleUser(raw: Record<string, unknown>): Record<string, unknown> {
	const row = postProcess(schema.users, raw)
	const doc: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(row)) {
		if (k === 'createdAt' || k === 'updatedAt' || USER_NEST_KEYS.has(k)) continue
		doc[k] = v
	}
	doc.paymentDetails = {
		stripeCustomerId: row.stripeCustomerId ?? null, paied: row.paymentPaid ?? false,
		paidDate: row.paymentPaidDate ?? null, messageError: row.paymentMessageError ?? null, dateError: row.paymentDateError ?? null,
	}
	doc.dreamJobsInterview = {
		jobId: row.dreamJobId ?? null, jobAppliedId: row.dreamJobAppliedId ?? null,
		createdAt: row.dreamJobCreatedAt ?? null, status: row.dreamJobStatus ?? null,
		completedAt: row.dreamJobCompletedAt ?? null, generalFeedback: row.dreamJobGeneralFeedback ?? null,
	}
	return doc
}

function decomposeUser(doc: Record<string, unknown>): Record<string, unknown> {
	const row: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(doc)) {
		if (k === 'id') continue
		if (k === 'paymentDetails') {
			const o = v as Record<string, unknown>
			row.stripeCustomerId = o?.stripeCustomerId; row.paymentPaid = o?.paied ?? false
			row.paymentPaidDate = o?.paidDate; row.paymentMessageError = o?.messageError; row.paymentDateError = o?.dateError; continue
		}
		if (k === 'dreamJobsInterview') {
			const o = v as Record<string, unknown>
			row.dreamJobId = o?.jobId; row.dreamJobAppliedId = o?.jobAppliedId
			row.dreamJobCreatedAt = o?.createdAt; row.dreamJobStatus = o?.status
			row.dreamJobCompletedAt = o?.completedAt; row.dreamJobGeneralFeedback = o?.generalFeedback; continue
		}
		row[k] = v
	}
	return row
}

export function createDrizzleUserRepository(db: DrizzleDb): UserRepository {
	return {
		async getUser(id) {
			const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
			if (!rows.length) return null
			return castWithSchema<User>(assembleUser(rows[0] as Record<string, unknown>), UserRepositorySchema)
		},

		async updateUser(id, data) {
			const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
			if (!rows.length) return
			const current = assembleUser(rows[0] as Record<string, unknown>)
			const patched = applyPatch(current, data)
			const decomposed = decomposeUser(patched)
			const cleaned = cleanForDb(schema.users, decomposed)
			await db.update(schema.users).set(cleaned as typeof schema.users.$inferInsert).where(eq(schema.users.id, id))
		},

		async createUser(data, customId) {
			const id = customId ?? randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const decomposed = decomposeUser(payload)
			const cleaned = cleanForDb(schema.users, decomposed)
			await db.insert(schema.users).values({ id, ...cleaned } as typeof schema.users.$inferInsert).onConflictDoNothing()
			return { ...payload, id }
		},

		async getUsersCompany(id) {
			const rows = await db.select().from(schema.usersCompany).where(eq(schema.usersCompany.id, id)).limit(1)
			if (!rows.length) return null
			const row = cast<Record<string, unknown>>(postProcess(schema.usersCompany, rows[0] as Record<string, unknown>))
			const companyId = row.company_id as string | undefined
			row.company = companyId ? { id: companyId } : null
			return castWithSchema<UsersCompany>(row, UsersCompanyRepositorySchema)
		},

		async createUsersCompany(data, customId) {
			const id = customId
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const decomposed = decomposeUsersCompany(payload)
			const cleaned = cleanForDb(schema.usersCompany, decomposed)
			await db.insert(schema.usersCompany).values({ id, ...cleaned } as typeof schema.usersCompany.$inferInsert).onConflictDoNothing()
			return { ...payload, id }
		},

		async updateUsersCompany(id, data) {
			const rows = await db.select().from(schema.usersCompany).where(eq(schema.usersCompany.id, id)).limit(1)
			if (!rows.length) return
			const current = cast<Record<string, unknown>>(postProcess(schema.usersCompany, rows[0] as Record<string, unknown>))
			const patched = applyPatch(current, data)
			const decomposed = decomposeUsersCompany(patched)
			const cleaned = cleanForDb(schema.usersCompany, decomposed)
			await db.update(schema.usersCompany).set(cleaned as typeof schema.usersCompany.$inferInsert).where(eq(schema.usersCompany.id, id))
		},

		async deleteUsersCompany(id) {
			await db.delete(schema.usersCompany).where(eq(schema.usersCompany.id, id))
		},

		async deleteUser(id) {
			await db.delete(schema.users).where(eq(schema.users.id, id))
		},

		async getCandidateProfile(id) {
			const rows = await db
				.select()
				.from(schema.candidateProfiles)
				.where(eq(schema.candidateProfiles.id, id))
				.limit(1)
			const row = rows.at(0)
			return row ? (postProcess(schema.candidateProfiles, row) as unknown as CandidateProfile) : null
		},

		async createCandidateProfile(data, customId) {
			const payload = cleanForDb(schema.candidateProfiles, toJsonSafe({ ...data, id: customId }) as Record<string, unknown>)
			await db
				.insert(schema.candidateProfiles)
				.values(payload as typeof schema.candidateProfiles.$inferInsert)
				// Currículo é upsert por natureza: várias fontes (chat, CV, LinkedIn)
				// alimentam o mesmo perfil, e a primeira a chegar não pode falhar as outras.
				.onConflictDoUpdate({
					target: schema.candidateProfiles.id,
					set: { ...(payload as Record<string, unknown>), updatedAt: new Date() },
				})
			return { ...data, id: customId } as CandidateProfile & { id: string }
		},

		async updateCandidateProfile(id, data) {
			const payload = cleanForDb(schema.candidateProfiles, toJsonSafe(data) as Record<string, unknown>)
			if (Object.keys(payload).length === 0) return
			await db
				.update(schema.candidateProfiles)
				.set({ ...(payload as Record<string, unknown>), updatedAt: new Date() } as never)
				.where(eq(schema.candidateProfiles.id, id))
		},

		async findUserByPhone(phone) {
			const rows = await db.select().from(schema.users)
				.where(eq(schema.users.phone_number, phone))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<User>(assembleUser(rows[0] as Record<string, unknown>), UserRepositorySchema)
		},

		async findUserByEmail(email) {
			const rows = await db.select().from(schema.users)
				.where(eq(schema.users.email, email))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<User>(assembleUser(rows[0] as Record<string, unknown>), UserRepositorySchema)
		},
	}
}
