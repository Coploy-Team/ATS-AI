export function extractRefId(value: unknown): string | null {
	if (typeof value === 'string') {
		const parts = value.split('/').filter(Boolean)
		return parts.at(-1) ?? null
	}

	if (!value || typeof value !== 'object') return null

	const record = value as Record<string, unknown>

	if (typeof record.id === 'string' && record.id.length > 0) {
		return record.id
	}

	if (typeof record.path === 'string' && record.path.length > 0) {
		const parts = record.path.split('/').filter(Boolean)
		return parts.at(-1) ?? null
	}

	const pathObj = record._path
	if (pathObj && typeof pathObj === 'object') {
		const segments = (pathObj as { segments?: unknown }).segments
		if (Array.isArray(segments) && segments.length > 0) {
			const last = segments.at(-1)
			return typeof last === 'string' ? last : null
		}
	}

	return null
}
