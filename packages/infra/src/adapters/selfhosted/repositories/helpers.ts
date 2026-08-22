import {
	and,
	asc,
	type Column,
	desc,
	eq,
	getTableColumns,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	notInArray,
	or,
	type SQL,
	sql,
} from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import type { ComparisonOperator, ListOptions } from '@coploy/domain'
import { dateToSql } from '../db/compat-date'
import * as schema from '../db/schema/tables'

export { and, asc, dateToSql, desc, eq, getTableColumns, or, randomUUID, schema, sql }
export type { Column, PgTable, SQL }

type FieldMap = Record<string, Column>

export function postProcess(table: PgTable, row: Record<string, unknown>): Record<string, unknown> {
	const cols = getTableColumns(table)
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(row)) {
		if (!(k in cols)) {
			out[k] = v
			continue
		}
		if (v instanceof Date) {
			out[k] = v
		} else if ((cols[k] as Column).columnType === 'PgNumeric' && typeof v === 'string') {
			const n = Number.parseFloat(v)
			out[k] = Number.isFinite(n) ? n : null
		} else {
			out[k] = v
		}
	}
	return out
}

export function stripInternal(obj: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	const skip = new Set(['id', 'job_applied_id', 'createdAt', 'updatedAt', 'created_at', 'updated_at', ...keys])
	for (const [k, v] of Object.entries(obj)) {
		if (!skip.has(k)) out[k] = v
	}
	return out
}

export function cleanForDb(table: PgTable, data: Record<string, unknown>): Record<string, unknown> {
	const cols = getTableColumns(table)
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(data)) {
		if (!(k in cols) || v === undefined) continue
		const col = cols[k] as Column
		out[k] = col.dataType === 'date' ? (dateToSql(v) ?? null) : v
	}
	return out
}

function prepareSqlValue(value: unknown): unknown {
	if (value instanceof Date) return value
	if (typeof value === 'object' && value !== null) {
		const d = dateToSql(value)
		if (d) return d
		if ('id' in value) return (value as { id: unknown }).id
	}
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
		const d = new Date(value)
		if (!Number.isNaN(d.getTime())) return d
	}
	return value
}

function resolveColumn(table: PgTable, field: string, fieldMap: FieldMap): Column | null {
	if (field === '__name__') return getTableColumns(table).id
	if (fieldMap[field]) return fieldMap[field]
	const cols = getTableColumns(table)
	return cols[field] ?? null
}

function buildCondition(column: Column, operator: ComparisonOperator, rawValue: unknown): SQL | null {
	const value = prepareSqlValue(rawValue)
	switch (operator) {
		case '==':
			return value === null ? isNull(column) : eq(column, value as never)
		case '!=':
			return value === null ? isNotNull(column) : ne(column, value as never)
		case '<':
			return lt(column, value as never)
		case '<=':
			return lte(column, value as never)
		case '>':
			return gt(column, value as never)
		case '>=':
			return gte(column, value as never)
		case 'in':
			if (!Array.isArray(rawValue) || !rawValue.length) return sql`FALSE`
			return inArray(column, rawValue.map(prepareSqlValue) as never[])
		case 'not-in':
			if (!Array.isArray(rawValue) || !rawValue.length) return sql`TRUE`
			return notInArray(column, rawValue.map(prepareSqlValue) as never[])
		case 'array-contains':
			return sql`${value} = ANY(${column})`
		case 'array-contains-any': {
			if (!Array.isArray(rawValue) || !rawValue.length) return sql`FALSE`
			const items = rawValue.map((v) => sql`${v}`)
			return sql`${column} && ARRAY[${sql.join(items, sql`, `)}]::text[]`
		}
		default:
			return null
	}
}

export function buildListParams(
	table: PgTable,
	fieldMap: FieldMap,
	staticConds: SQL[],
	options?: ListOptions,
) {
	const conditions = [...staticConds]

	for (const filter of options?.filters ?? []) {
		const col = resolveColumn(table, filter.field, fieldMap)
		if (!col) continue
		const cond = buildCondition(col, filter.operator, filter.value)
		if (cond) conditions.push(cond)
	}

	let orderByExpr: ReturnType<typeof asc> | undefined
	let orderByList: ReturnType<typeof asc>[] | undefined
	if (options?.orderBy && options.orderBy.length > 0) {
		const resolved = options.orderBy
			.map((o) => {
				const col = resolveColumn(table, o.field, fieldMap)
				return col ? { col, direction: o.direction } : null
			})
			.filter((x): x is { col: Column; direction: 'asc' | 'desc' } => x !== null)

		if (resolved.length > 0) {
			if (options.startAfterCompoundCursor && options.startAfterCompoundCursor.length > 0) {
				const cursorEntries = options.startAfterCompoundCursor
					.map((entry) => {
						const col = resolveColumn(table, entry.field, fieldMap)
						return col ? { col, value: prepareSqlValue(entry.value), direction: entry.direction } : null
					})
					.filter((x): x is { col: Column; value: unknown; direction: 'asc' | 'desc' } => x !== null)

				const orClauses: SQL[] = []
				for (let i = 0; i < cursorEntries.length; i++) {
					const equalityPrefix = cursorEntries.slice(0, i).map((e) =>
						e.value === null ? isNull(e.col) : eq(e.col, e.value as never),
					)
					const last = cursorEntries[i]
					const tail =
						last.direction === 'desc' ? lt(last.col, last.value as never) : gt(last.col, last.value as never)
					const clause = equalityPrefix.length > 0 ? and(...equalityPrefix, tail) : tail
					if (clause) orClauses.push(clause)
				}
				if (orClauses.length > 0) {
					const combined = orClauses.length === 1 ? orClauses[0] : or(...orClauses)
					if (combined) conditions.push(combined)
				}
			}

			orderByList = resolved.map(({ col, direction }) =>
				direction === 'desc' ? desc(col) : asc(col),
			)
		}
	} else if (options?.orderByField) {
		const col = resolveColumn(table, options.orderByField, fieldMap)
		if (col) {
			if (options.startAfterCursor != null) {
				const cursor = prepareSqlValue(options.startAfterCursor)
				conditions.push(
					options.orderDirection === 'desc' ? lt(col, cursor as never) : gt(col, cursor as never),
				)
			}
			orderByExpr = options.orderDirection === 'desc' ? desc(col) : asc(col)
		}
	}

	return {
		where: conditions.length ? and(...conditions) : undefined,
		orderBy: orderByExpr,
		orderByList,
		limit: options?.limitTo,
	}
}

export function toJsonSafe(value: unknown): unknown {
	if (value === null || value === undefined) return null
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'object') {
		const fn = (value as { toDate?: () => Date }).toDate
		if (typeof fn === 'function') { const d = fn.call(value); if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString() }
		if (Array.isArray(value)) return value.map(toJsonSafe)
		const obj: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) obj[k] = toJsonSafe(v)
		return obj
	}
	return String(value)
}

export function applyPatch(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
	const out = structuredClone(base)
	for (const [key, raw] of Object.entries(patch)) {
		if (raw === undefined) continue
		const value = toJsonSafe(raw)
		if (!key.includes('.')) { out[key] = value; continue }
		const parts = key.split('.').filter(Boolean)
		if (!parts.length) continue
		let cursor: Record<string, unknown> = out
		for (let i = 0; i < parts.length - 1; i++) {
			const p = parts[i]
			if (typeof cursor[p] !== 'object' || cursor[p] === null || Array.isArray(cursor[p])) cursor[p] = {}
			cursor = cursor[p] as Record<string, unknown>
		}
		const last = parts.at(-1)
		if (last) cursor[last] = value
	}
	return out
}

/**
 * Type-safe helpers for query payloads.
 * `cast` mantém parse estrutural mínimo.
 * `castWithId` adiciona validação de identidade para leituras (`id` obrigatório).
 */
const repositoryPayloadSchema = z.union([
	z.record(z.string(), z.unknown()),
	z.array(z.record(z.string(), z.unknown())),
])
const repositoryPayloadWithIdSchema = z.union([
	z.object({ id: z.string() }).passthrough(),
	z.array(z.object({ id: z.string() }).passthrough()),
])

function parseRepositoryPayload<T>(
	value: unknown,
	source = 'repository payload',
	requireId = false,
): T {
	const schema = requireId ? repositoryPayloadWithIdSchema : repositoryPayloadSchema
	const parsed = schema.safeParse(value)
	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || '[root]'} ${issue.message}`)
			.join('; ')
		throw new Error(`${source} does not match repository output shape: ${details}`)
	}
	return parsed.data as T
}

function parseRepositoryPayloadWithSchema<T>(
	value: unknown,
	schema: z.ZodTypeAny,
	source = 'repository payload schema',
): T {
	const parsed = schema.safeParse(value)
	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || '[root]'} ${issue.message}`)
			.join('; ')
		throw new Error(`${source} does not match repository output schema: ${details}`)
	}
	return parsed.data as T
}

export function cast<T>(value: unknown): T {
	return parseRepositoryPayload<T>(value, 'cast<T>()', false)
}

export function castWithId<T>(value: unknown): T {
	return parseRepositoryPayload<T>(value, 'castWithId<T>()', true)
}

export function castWithSchema<T>(value: unknown, schema: z.ZodTypeAny): T {
	return parseRepositoryPayloadWithSchema(value, schema, 'castWithSchema<T>()')
}
