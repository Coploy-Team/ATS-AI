/** A reference to another document/entity, normalized from DocumentReference or FK. */
export interface EntityRef {
	id: string
	path?: string
}

/** Data payload for creating a new entity of type T (excludes auto-generated id). */
export type CreateInput<T extends { id: string }> = Omit<T, 'id'>

/**
 * Data payload for updating an existing entity of type T (all fields optional, id excluded).
 * Also accepts arbitrary string keys to support Firestore dot-notation updates
 * (e.g., "interview.info", "batchProcessing.questionsProcessed").
 */
export type UpdateInput<T extends { id: string }> = Partial<Omit<T, 'id'>> & {
	[key: string]: unknown
}
