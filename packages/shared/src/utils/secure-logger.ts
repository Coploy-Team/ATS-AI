const SENSITIVE_FIELDS = [
	'password',
	'token',
	'authorization',
	'bearer',
	'secret',
	'key',
	'cpf',
	'cnpj',
	'credit_card',
	'card_number',
	'cvv',
	'stripe-signature',
	'x-api-key',
]

const SENSITIVE_HEADERS = [
	'authorization',
	'cookie',
	'set-cookie',
	'stripe-signature',
	'x-api-key',
	'x-auth-token',
]

function sanitizeObject(obj: unknown, depth = 0): unknown {
	if (depth > 10) return '[Object too deep]'
	if (obj === null || obj === undefined) return obj
	if (typeof obj === 'string') return sanitizeString(obj)
	if (typeof obj === 'number' || typeof obj === 'boolean') return obj
	if (obj instanceof Date) return obj.toISOString()

	if (Array.isArray(obj)) {
		return obj.map((item) => sanitizeObject(item, depth + 1))
	}

	if (typeof obj === 'object') {
		const sanitized: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(obj)) {
			const lowerKey = key.toLowerCase()
			if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))) {
				sanitized[key] = '[REDACTED]'
			} else if (lowerKey.includes('header') && typeof value === 'object') {
				sanitized[key] = sanitizeHeaders(value as Record<string, unknown>)
			} else {
				sanitized[key] = sanitizeObject(value, depth + 1)
			}
		}
		return sanitized
	}

	return obj
}

function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
	if (!headers || typeof headers !== 'object') return headers

	const sanitized: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(headers)) {
		sanitized[key] = SENSITIVE_HEADERS.includes(key.toLowerCase())
			? '[REDACTED]'
			: value
	}
	return sanitized
}

function sanitizeString(str: string): string {
	return str
		.replace(/eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[JWT_REDACTED]')
		.replace(/Bearer\s+[-a-zA-Z0-9._]+/gi, 'Bearer [TOKEN_REDACTED]')
		.replace(/password=([^&\s]+)/gi, 'password=[REDACTED]')
}

type RequestLike = {
	method?: string
	url?: string
	ip?: string
	headers?: Record<string, unknown>
}

function createRequestContext(request?: RequestLike): Record<string, unknown> {
	if (!request) return {}
	return {
		method: request.method,
		url: request.url,
		ip: request.ip ?? 'unknown',
		headers: request.headers ? sanitizeHeaders(request.headers) : undefined,
	}
}

class SecureLogger {
	error(message: string, data?: unknown, request?: RequestLike): void {
		const sanitizedData = data ? sanitizeObject(data) : undefined
		const context = createRequestContext(request)
		console.error(`[ERROR] ${message}`, { ...context, data: sanitizedData })
	}

	warn(message: string, data?: unknown, request?: RequestLike): void {
		const sanitizedData = data ? sanitizeObject(data) : undefined
		const context = createRequestContext(request)
		console.warn(`[WARN] ${message}`, { ...context, data: sanitizedData })
	}

	info(message: string, data?: unknown, request?: RequestLike): void {
		const sanitizedData = data ? sanitizeObject(data) : undefined
		const context = createRequestContext(request)
		console.info(`[INFO] ${message}`, { ...context, data: sanitizedData })
	}

	debug(message: string, data?: unknown, request?: RequestLike): void {
		if (process.env.NODE_ENV === 'production') return
		const sanitizedData = data ? sanitizeObject(data) : undefined
		const context = createRequestContext(request)
		console.debug(`[DEBUG] ${message}`, { ...context, data: sanitizedData })
	}

	authError(message: string, userId?: string, request?: RequestLike): void {
		const context = createRequestContext(request)
		console.error(`[AUTH] ${message}`, { userId, ...context })
	}
}

export const secureLogger = new SecureLogger()
export type { SecureLogger }
