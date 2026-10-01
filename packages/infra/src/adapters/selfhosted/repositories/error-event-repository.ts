import type { ErrorEvent } from '@coploy/domain'
import type { ErrorEventRepository } from '../../../interfaces/repositories/error-event-repository'
import type { DrizzleDb } from '../db/client'
import { ErrorEventRepositorySchema } from '../../shared/repository-schemas'
import { and, count } from 'drizzle-orm'
import {
	cast,
	castWithSchema,
	cleanForDb,
	desc,
	eq,
	postProcess,
	randomUUID,
	schema,
	toJsonSafe,
} from './helpers'

export function createDrizzleErrorEventRepository(
	db: DrizzleDb,
): ErrorEventRepository {
	return {
		async listAll(opts) {
			const limit = opts?.limit ?? 100
			let q = db.select().from(schema.errorEvents).$dynamic()
			if (typeof opts?.resolved === 'boolean') {
				q = q.where(eq(schema.errorEvents.resolved, opts.resolved))
			} else if (opts?.companyId) {
				q = q.where(eq(schema.errorEvents.companyId, opts.companyId))
			} else if (opts?.interviewId) {
				q = q.where(eq(schema.errorEvents.interviewId, opts.interviewId))
			} else if (opts?.service) {
				q = q.where(eq(schema.errorEvents.service, opts.service))
			}
			const rows = await q.orderBy(desc(schema.errorEvents.createdAt)).limit(limit)
			return rows.map((r) =>
				castWithSchema<ErrorEvent>(
					postProcess(schema.errorEvents, r as Record<string, unknown>),
					ErrorEventRepositorySchema,
				),
			)
		},
		async listByCompany(companyId, limit = 50) {
			const rows = await db
				.select()
				.from(schema.errorEvents)
				.where(eq(schema.errorEvents.companyId, companyId))
				.orderBy(desc(schema.errorEvents.createdAt))
				.limit(limit)
			return rows.map((r) =>
				castWithSchema<ErrorEvent>(
					postProcess(schema.errorEvents, r as Record<string, unknown>),
					ErrorEventRepositorySchema,
				),
			)
		},
		async listByInterview(interviewId, limit = 50) {
			const rows = await db
				.select()
				.from(schema.errorEvents)
				.where(eq(schema.errorEvents.interviewId, interviewId))
				.orderBy(desc(schema.errorEvents.createdAt))
				.limit(limit)
			return rows.map((r) =>
				castWithSchema<ErrorEvent>(
					postProcess(schema.errorEvents, r as Record<string, unknown>),
					ErrorEventRepositorySchema,
				),
			)
		},
		async getById(id) {
			const rows = await db
				.select()
				.from(schema.errorEvents)
				.where(eq(schema.errorEvents.id, id))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<ErrorEvent>(
				postProcess(schema.errorEvents, rows[0] as Record<string, unknown>),
				ErrorEventRepositorySchema,
			)
		},
		async create(data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe({ ...data, resolved: data.resolved ?? false }))
			const cleaned = cleanForDb(schema.errorEvents, payload)
			await db
				.insert(schema.errorEvents)
				.values({
					id,
					...cleaned,
				} as typeof schema.errorEvents.$inferInsert)
				.onConflictDoNothing()
			return { ...payload, id } as unknown as ErrorEvent & { id: string }
		},
		async markResolved(id, resolvedBy) {
			await db
				.update(schema.errorEvents)
				.set({
					resolved: true,
					resolvedAt: new Date(),
					resolvedBy,
				})
				.where(eq(schema.errorEvents.id, id))
		},
		async count(filters) {
			const conds = []
			if (typeof filters?.resolved === 'boolean') conds.push(eq(schema.errorEvents.resolved, filters.resolved))
			if (filters?.companyId) conds.push(eq(schema.errorEvents.companyId, filters.companyId))
			if (filters?.interviewId) conds.push(eq(schema.errorEvents.interviewId, filters.interviewId))
			if (filters?.service) conds.push(eq(schema.errorEvents.service, filters.service))
			const [row] = await db
				.select({ value: count() })
				.from(schema.errorEvents)
				.where(conds.length > 0 ? and(...conds) : undefined)
			return row?.value ?? 0
		},
	}
}
