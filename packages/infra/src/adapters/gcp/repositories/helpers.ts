import { DocumentReference, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { z } from 'zod'

import type { ComparisonOperator, ListOptions } from '@coploy/domain'
import { extractRefId } from '../../shared/ref-utils'

const OPERATOR_MAP: Record<ComparisonOperator, FirebaseFirestore.WhereFilterOp> = {
	'==': '==',
	'!=': '!=',
	'<': '<',
	'<=': '<=',
	'>': '>',
	'>=': '>=',
	'in': 'in',
	'not-in': 'not-in',
	'array-contains': 'array-contains',
	'array-contains-any': 'array-contains-any',
}

const firestoreDocumentSchema = z.record(z.string(), z.unknown())
const firestoreDocumentSchemaWithId = z.object({ id: z.string() }).passthrough()
const firestoreDocumentsSchema = z.array(firestoreDocumentSchema)
const firestoreDocumentsSchemaWithId = z.array(firestoreDocumentSchemaWithId)

function parseDocument(value: unknown, requireId = true): Record<string, unknown> {
	const parsed = (requireId ? firestoreDocumentSchemaWithId : firestoreDocumentSchema).safeParse(value)
	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || '[root]'} ${issue.message}`)
			.join('; ')
		throw new Error(`Invalid Firestore document shape at repository boundary: ${details}`)
	}
	return parsed.data
}

function parseDocumentWithSchema<T>(value: unknown, schema: z.ZodTypeAny, source = 'mapDoc'): T {
	const parsed = schema.safeParse(value)
	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || '[root]'} ${issue.message}`)
			.join('; ')
		throw new Error(`Invalid Firestore document schema at repository boundary (${source}): ${details}`)
	}
	return parsed.data as T
}

function parseDocuments(value: unknown[], requireId = true): Record<string, unknown>[] {
	const parsed = (requireId ? firestoreDocumentsSchemaWithId : firestoreDocumentsSchema).safeParse(value)
	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || '[root]'} ${issue.message}`)
			.join('; ')
		throw new Error(`Invalid Firestore documents shape at repository boundary: ${details}`)
	}
	return parsed.data
}

function parseDocumentsWithSchema<T>(value: unknown[], schema: z.ZodTypeAny, source = 'mapDocs'): T[] {
	const parsed = z.array(schema).safeParse(value)
	if (!parsed.success) {
		const details = parsed.error.issues
			.map((issue) => `${issue.path.join('.') || '[root]'} ${issue.message}`)
			.join('; ')
		throw new Error(`Invalid Firestore documents schema at repository boundary (${source}): ${details}`)
	}
	return parsed.data as T[]
}

function normalizeValue(value: unknown): unknown {
	if (value instanceof Timestamp) return value.toDate()
	if (value instanceof DocumentReference) return { id: value.id, path: value.path }
	if (Array.isArray(value)) return value.map(normalizeValue)
	if (value !== null && typeof value === 'object')
		return normalizeDoc(value as Record<string, unknown>)
	return value
}

function normalizeDoc(data: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {}
	for (const [key, val] of Object.entries(data)) result[key] = normalizeValue(val)
	return result
}

export function mapDoc<T = Record<string, unknown>>(
	doc: FirebaseFirestore.DocumentSnapshot,
	schema?: z.ZodTypeAny,
): T | null {
	if (!doc.exists) return null
	const payload = normalizeDoc({ id: doc.id, ...doc.data() })
	return schema ? parseDocumentWithSchema(payload, schema) : parseDocument(payload) as T
}

export function applyFilters(
	queryRef: FirebaseFirestore.Query,
	options?: ListOptions,
): FirebaseFirestore.Query {
	let ref = queryRef

	if (options?.filters) {
		for (const filter of options.filters) {
			ref = ref.where(
				filter.field,
				OPERATOR_MAP[filter.operator],
				filter.value,
			)
		}
	}

	if (options?.orderBy && options.orderBy.length > 0) {
		for (const o of options.orderBy) {
			ref = ref.orderBy(o.field, o.direction)
		}
	} else if (options?.orderByField) {
		ref = ref.orderBy(options.orderByField, options.orderDirection ?? 'asc')
	}

	if (
		options?.startAfterCompoundCursor &&
		options.startAfterCompoundCursor.length > 0 &&
		options?.orderBy &&
		options.orderBy.length > 0
	) {
		const cursorValues = options.startAfterCompoundCursor.map((entry) => {
			const v = entry.value
			if (typeof v === 'string') {
				const dateValue = new Date(v)
				if (!Number.isNaN(dateValue.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
					return Timestamp.fromDate(dateValue)
				}
				return v
			}
			if (v instanceof Date) return Timestamp.fromDate(v)
			return v
		})
		ref = ref.startAfter(...cursorValues)
	} else if (options?.startAfterCursor !== undefined && options?.orderByField) {
		let cursorValue: Timestamp | string | Date | number = options.startAfterCursor

		// Strings ISO viram Timestamp; Date vira Timestamp; number passa direto
		// (usado quando ordenamos por campo numérico — ex: score_value no hunting).
		if (typeof cursorValue === 'string') {
			const dateValue = new Date(cursorValue)
			if (!Number.isNaN(dateValue.getTime())) {
				cursorValue = Timestamp.fromDate(dateValue)
			}
		} else if (cursorValue instanceof Date) {
			cursorValue = Timestamp.fromDate(cursorValue)
		}

		const operator = options.orderDirection === 'desc' ? '<' : '>'
		ref = ref.where(options.orderByField, operator, cursorValue)
	}

	if (options?.limitTo) {
		ref = ref.limit(options.limitTo)
	}

	return ref
}

export function mapDocs<T>(querySnapshot: FirebaseFirestore.QuerySnapshot): T[] {
	const rows = querySnapshot.docs.map((doc) => normalizeDoc({ id: doc.id, ...doc.data() }))
	return parseDocuments(rows) as T[]
}

export function mapDocsWithSchema<T>(querySnapshot: FirebaseFirestore.QuerySnapshot, schema: z.ZodTypeAny): T[] {
	const rows = querySnapshot.docs.map((doc) => normalizeDoc({ id: doc.id, ...doc.data() }))
	return parseDocumentsWithSchema(rows, schema)
}

export function mapArrayToCollectionDocRefs(
	db: Firestore,
	collectionName: string,
	values: unknown[],
) {
	return values.map((value) => {
		const refId = extractRefId(value)
		return refId ? db.collection(collectionName).doc(refId) : value
	})
}

export { normalizeDoc }
