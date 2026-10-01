import { createHmac, timingSafeEqual, createHash } from 'node:crypto'

/**
 * Tokens OAuth stateless (HS256) — evita repositório novo na fase 1.
 * Tudo que o fluxo precisa (redirect_uris do client DCR, PKCE challenge do
 * code, uid do access/refresh) viaja assinado dentro do próprio token.
 * Trade-off consciente: sem revogação server-side até existir um store.
 */

export type ClientTokenPayload = {
	kind: 'client'
	clientName: string
	redirectUris: string[]
}

export type CodeTokenPayload = {
	kind: 'code'
	uid: string
	clientId: string
	redirectUri: string
	codeChallenge: string
	scope: string
}

export type AccessTokenPayload = {
	kind: 'access'
	uid: string
	scope: string
}

export type RefreshTokenPayload = {
	kind: 'refresh'
	uid: string
	scope: string
	clientId: string
}

type AnyPayload =
	| ClientTokenPayload
	| CodeTokenPayload
	| AccessTokenPayload
	| RefreshTokenPayload

type SignedClaims = { iat: number; exp: number }

export const TOKEN_TTL_SECONDS = {
	code: 120,
	access: 60 * 60,
	refresh: 60 * 60 * 24 * 30,
	client: 60 * 60 * 24 * 365,
} as const

function base64UrlEncode(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url')
}

function hmac(secret: string, data: string): Buffer {
	return createHmac('sha256', secret).update(data).digest()
}

export function signToken<T extends AnyPayload>(
	payload: T,
	secret: string,
	ttlSeconds: number,
): string {
	const now = Math.floor(Date.now() / 1000)
	const claims: T & SignedClaims = { ...payload, iat: now, exp: now + ttlSeconds }
	const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
	const body = base64UrlEncode(JSON.stringify(claims))
	const signature = base64UrlEncode(hmac(secret, `${header}.${body}`))
	return `${header}.${body}.${signature}`
}

export function verifyToken<T extends AnyPayload>(
	token: string,
	secret: string,
	expectedKind: T['kind'],
): (T & SignedClaims) | null {
	const parts = token.split('.')
	if (parts.length !== 3) return null
	const [header, body, signature] = parts

	const expected = hmac(secret, `${header}.${body}`)
	let provided: Buffer
	try {
		provided = Buffer.from(signature, 'base64url')
	} catch {
		return null
	}
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
		return null
	}

	let claims: T & SignedClaims
	try {
		claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
	} catch {
		return null
	}

	if (claims.kind !== expectedKind) return null
	if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) {
		return null
	}
	return claims
}

/** PKCE S256: challenge == BASE64URL(SHA256(verifier)) — RFC 7636. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
	const digest = createHash('sha256').update(codeVerifier).digest('base64url')
	if (digest.length !== codeChallenge.length) return false
	return timingSafeEqual(Buffer.from(digest), Buffer.from(codeChallenge))
}
