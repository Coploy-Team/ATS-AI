import {
	type DocumentData,
	type Firestore,
	Timestamp,
	type WhereFilterOp,
} from 'firebase-admin/firestore'

import type { ListOptions } from './types'

function applyFilters(
	queryRef: FirebaseFirestore.Query,
	options?: ListOptions,
): FirebaseFirestore.Query {
	let ref = queryRef

	if (options?.filters) {
		for (const filter of options.filters) {
			ref = ref.where(filter.field, filter.operator, filter.value)
		}
	}

	if (options?.orderByField) {
		ref = ref.orderBy(options.orderByField, options.orderDirection ?? 'asc')
	}

	if (options?.startAfterCursor && options?.orderByField) {
		let cursorValue: Timestamp | string | Date = options.startAfterCursor

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

function logIndexError(context: string, options: ListOptions | undefined, error: Record<string, unknown>): void {
	const isIndexError =
		String(error?.message ?? '').includes('index') ||
		String(error?.message ?? '').includes('FAILED_PRECONDITION') ||
		error?.code === 9 ||
		error?.code === 'failed-precondition'

	if (!isIndexError) {
		console.error(`[Firestore] ${context} error:`, {
			message: error?.message,
			code: error?.code,
		})
		return
	}

	console.error(`[Firestore] INDEX REQUIRED - ${context}`)
	console.error('[Firestore] Error:', error?.message)

	const linkMatch = String(error?.message ?? '').match(
		/(https:\/\/console\.firebase\.google\.com[^\s]+)/,
	)

	if (linkMatch) {
		console.error('[Firestore] Create index:', linkMatch.at(0))
	} else {
		console.error(
			'[Firestore] Create index at: https://console.firebase.google.com/project/_/firestore/indexes',
		)
	}

	if (options?.filters) {
		console.error(
			'[Firestore] Filters:',
			options.filters.map((f) => `${f.field} ${f.operator} ${String(f.value)}`),
		)
	}

	if (options?.orderByField) {
		console.error(
			`[Firestore] OrderBy: ${options.orderByField} ${options.orderDirection ?? 'asc'}`,
		)
	}
}

function mapDocs<T>(querySnapshot: FirebaseFirestore.QuerySnapshot): T[] {
	return querySnapshot.docs.map((doc) => ({
		id: doc.id,
		...doc.data(),
	})) as T[]
}

/**
 * Creates a Firestore helper with CRUD operations, subcollection support,
 * cursor-based pagination, and detailed index error logging.
 *
 * @example
 * ```typescript
 * const firebase = createFirebaseAdmin(config)
 * const firestoreDB = createFirestoreDB(firebase.db)
 *
 * const company = await firestoreDB.get<Companies>('companies', companyId)
 * const interviews = await firestoreDB.list<Interview>('interviews', {
 *   filters: [{ field: 'companyId', operator: '==', value: companyId }],
 *   orderByField: 'createdAt',
 *   orderDirection: 'desc',
 *   limitTo: 10,
 * })
 * ```
 */
export function createFirestoreDB(db: Firestore) {
	return {
		async get<T>(collectionName: string, id: string): Promise<T | null> {
			const docRef = db.collection(collectionName).doc(id)
			const docSnap = await docRef.get()

			if (!docSnap.exists) {
				return null
			}

			return { id: docSnap.id, ...docSnap.data() } as T
		},

		async list<T>(collectionName: string, options?: ListOptions): Promise<T[]> {
			try {
				const queryRef = applyFilters(db.collection(collectionName), options)
				const querySnapshot = await queryRef.get()
				return mapDocs<T>(querySnapshot)
			} catch (error) {
				logIndexError(`list("${collectionName}")`, options, error as Record<string, unknown>)
				return []
			}
		},

		async create<T>(
			collectionName: string,
			data: DocumentData,
			customId?: string,
		): Promise<T & { id: string }> {
			const collectionRef = db.collection(collectionName)

			if (customId) {
				const docRef = collectionRef.doc(customId)
				await docRef.set(data)
				return { ...data, id: customId } as T & { id: string }
			}

			const docRef = await collectionRef.add(data)
			return { ...data, id: docRef.id } as T & { id: string }
		},

		async update<T>(
			collectionName: string,
			id: string,
			data: Partial<T>,
		): Promise<void> {
			const docRef = db.collection(collectionName).doc(id)
			await docRef.update(data as DocumentData)
		},

		async set<T>(
			collectionName: string,
			id: string,
			data: Partial<T>,
		): Promise<void> {
			const docRef = db.collection(collectionName).doc(id)
			await docRef.set(data as DocumentData, { merge: true })
		},

		async remove(collectionName: string, id: string): Promise<void> {
			const docRef = db.collection(collectionName).doc(id)
			await docRef.delete()
		},

		async getSubCollection<T>(
			path: string[],
			options?: ListOptions,
		): Promise<T[]> {
			try {
				const collectionPath = path.join('/')
				const queryRef = applyFilters(db.collection(collectionPath), options)
				const querySnapshot = await queryRef.get()
				return mapDocs<T>(querySnapshot)
			} catch (error) {
				logIndexError(
					`getSubCollection("${path.join('/')}")`,
					options,
					error as Record<string, unknown>,
				)
				return []
			}
		},

		async getSubDocument<T>(path: string[]): Promise<T | null> {
			try {
				let docRef: FirebaseFirestore.CollectionReference = db.collection(path[0])

				for (let i = 1; i < path.length; i += 2) {
					if (i + 1 < path.length) {
						docRef = docRef
							.doc(path[i])
							.collection(path[i + 1]) as FirebaseFirestore.CollectionReference
					} else {
						const finalDocRef = docRef.doc(path[i])
						const docSnap = await finalDocRef.get()

						if (!docSnap.exists) {
							return null
						}

						return { id: docSnap.id, ...docSnap.data() } as T
					}
				}

				return null
			} catch {
				return null
			}
		},

		async getSubCollectionWhere<T>(
			path: string[],
			field: string,
			operator: WhereFilterOp,
			value: string | number | boolean | Timestamp,
		): Promise<T[]> {
			try {
				const collectionPath = path.join('/')
				const queryRef = db.collection(collectionPath).where(field, operator, value)
				const querySnapshot = await queryRef.get()
				return mapDocs<T>(querySnapshot)
			} catch {
				return []
			}
		},
	}
}

export type FirestoreDB = ReturnType<typeof createFirestoreDB>
