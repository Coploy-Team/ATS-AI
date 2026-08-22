import type {
	DocumentReference,
	OrderByDirection,
	Timestamp,
	WhereFilterOp,
} from 'firebase-admin/firestore'

export type FirebaseAdminConfig = {
	projectId: string
	clientEmail: string
	privateKey: string
	databaseURL: string
	storageBucket: string
}

export type QueryFilter = {
	field: string
	operator: WhereFilterOp
	value:
		| string
		| number
		| boolean
		| Timestamp
		| DocumentReference
		| DocumentReference[]
}

export type ListOptions = {
	filters?: QueryFilter[]
	orderByField?: string
	orderDirection?: OrderByDirection
	limitTo?: number
	startAfterCursor?: string | Date | Timestamp
}
