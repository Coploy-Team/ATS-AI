/**
 * Converts any date-like value into a plain Date suitable for SQL parameterisation.
 * Handles: Date, string (ISO), number (epoch ms), Firestore Timestamp objects,
 * and objects with .toDate() / .toMillis() methods.
 */
export function dateToSql(value: unknown): Date | null {
	if (value == null) return null
	if (value instanceof Date) return value

	if (typeof value === 'string') {
		const d = new Date(value)
		return Number.isNaN(d.getTime()) ? null : d
	}

	if (typeof value === 'number') {
		const d = new Date(value)
		return Number.isNaN(d.getTime()) ? null : d
	}

	if (typeof value === 'object') {
		const obj = value as Record<string, unknown>

		if (typeof obj.toDate === 'function') {
			const d = (obj as { toDate: () => Date }).toDate()
			if (d instanceof Date && !Number.isNaN(d.getTime())) return d
		}

		if (typeof obj.toMillis === 'function') {
			const ms = (obj as { toMillis: () => number }).toMillis()
			return new Date(ms)
		}

		if ('seconds' in obj && typeof obj.seconds === 'number') {
			const nanos = typeof obj.nanoseconds === 'number' ? obj.nanoseconds : 0
			return new Date(obj.seconds * 1000 + Math.floor(nanos / 1_000_000))
		}

		if ('_seconds' in obj && typeof obj._seconds === 'number') {
			const nanos = typeof obj._nanoseconds === 'number' ? obj._nanoseconds : 0
			return new Date(obj._seconds * 1000 + Math.floor(nanos / 1_000_000))
		}
	}

	return null
}
