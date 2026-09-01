/**
 * Removes keys whose value is `undefined` from a plain object.
 * Useful because Firestore/Drizzle rejects `undefined` values.
 */
export function removeUndefinedFields<T extends Record<string, unknown>>(obj: T): T {
	const cleaned = {} as T
	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined) {
			;(cleaned as Record<string, unknown>)[key] = value
		}
	}
	return cleaned
}
