import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto'

import { z } from 'zod'
import type { VerifiedOtsAttestation } from '@coploy/domain'

/**
 * Verificação de attestation OTS 0.2 apresentado por um candidato — o lado
 * do CONSUMO do padrão (ADR-007, decisão 6). É isto que torna a Coploy
 * também verificadora, não só emissora: aceita prova de QUALQUER emissor
 * cujo JWKS verifique (modelo federado, leitura livre — decisões de
 * governança de 2026-08-21).
 *
 * A ordem das checagens conta a história do modelo de ameaças da spec:
 * 1. estrutura (JWS de 3 partes, header EdDSA + typ do padrão)
 * 2. claims contra o shape do schema normativo (tier respeitado)
 * 3. `iss` são: https obrigatório (localhost aceito pro loop de dev) — o
 *    `iss` vem DE FORA e nós vamos fazer fetch dele, então ele é entrada de
 *    SSRF; nada de IP privado, nada de porta interna via http
 * 4. assinatura Ed25519 contra o JWKS publicado pelo emissor
 * 5. expiração
 * 6. vínculo com a PESSOA: o e-mail do candidato bate com subject.emailHash
 *    (sem hash não há vínculo — prova de outra pessoa não entra)
 * 7. revogação no statusUrl (mesma origem do iss — statusUrl também é
 *    entrada): `revoked` derruba; indisponível vira `unknown` no snapshot,
 *    porque punir o candidato por downtime do emissor inverte a culpa.
 */

export type OtsVerificationFailure =
	| 'malformed'
	| 'unsupported_header'
	| 'invalid_claims'
	| 'issuer_not_allowed'
	| 'jwks_unreachable'
	| 'unknown_kid'
	| 'bad_signature'
	| 'expired'
	| 'revoked'
	| 'subject_mismatch'

export type OtsVerificationResult =
	| { ok: true; attestation: VerifiedOtsAttestation }
	| { ok: false; reason: OtsVerificationFailure }

const outcomeSchema = z
	.object({
		score: z.number().min(0).max(10).nullable().optional(),
		strengths: z.array(z.string()).nullable().optional(),
		developmentAreas: z.array(z.string()).nullable().optional(),
	})
	.nullable()

/** Espelho zod do attestation.schema.json — inclui as regras de tier. */
const claimsSchema = z
	.object({
		iss: z.string().url(),
		sub: z.string().min(1),
		jti: z.string().min(8),
		iat: z.number().int(),
		exp: z.number().int().nullable().optional(),
		ots_version: z.literal('0.2'),
		tier: z.enum(['existence', 'summary', 'full']),
		subject: z
			.object({
				displayName: z.string().nullable().optional(),
				emailHash: z
					.string()
					.regex(/^sha256:[0-9a-f]{64}$/)
					.nullable()
					.optional(),
			})
			.optional(),
		process: z
			.object({
				companyName: z.string().nullable().optional(),
				jobTitle: z.string().nullable().optional(),
			})
			.optional(),
		interview: z.object({
			completedAt: z.string(),
			mode: z.string().nullable().optional(),
			language: z.string().nullable().optional(),
			questionsTotal: z.number().int().min(0).nullable().optional(),
		}),
		outcome: outcomeSchema.optional(),
		statusUrl: z.string().url(),
	})
	.superRefine((claims, ctx) => {
		if (claims.tier === 'existence' && claims.outcome != null) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'existence tier must not carry outcome' })
		}
		if (claims.tier === 'summary' && claims.outcome?.score != null) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'summary tier must not carry score' })
		}
	})

function isAllowedIssuerUrl(raw: string): boolean {
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		return false
	}
	if (url.protocol === 'https:') return true
	// http só pro loop de dev local — nunca pra rede interna (SSRF).
	return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await fetch(url, { signal: controller.signal, redirect: 'error' })
		if (!response.ok) return null
		return await response.json()
	} catch {
		return null
	} finally {
		clearTimeout(timer)
	}
}

export function createOtsVerificationService(deps?: { fetchJson?: typeof fetchJson }) {
	const getJson = deps?.fetchJson ?? fetchJson

	return {
		async verify(jws: string, candidateEmail: string | null): Promise<OtsVerificationResult> {
			const parts = jws.trim().split('.')
			if (parts.length !== 3) return { ok: false, reason: 'malformed' }

			let header: { alg?: string; typ?: string; kid?: string }
			let rawClaims: unknown
			try {
				header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
				rawClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
			} catch {
				return { ok: false, reason: 'malformed' }
			}
			if (header.alg !== 'EdDSA' || header.typ !== 'ots-attestation+jws') {
				return { ok: false, reason: 'unsupported_header' }
			}

			const parsed = claimsSchema.safeParse(rawClaims)
			if (!parsed.success) return { ok: false, reason: 'invalid_claims' }
			const claims = parsed.data

			const issuerBase = claims.iss.replace(/\/$/, '')
			if (!isAllowedIssuerUrl(issuerBase)) return { ok: false, reason: 'issuer_not_allowed' }
			// statusUrl também vira fetch nosso: só é aceito DEBAIXO do iss.
			if (!claims.statusUrl.startsWith(`${issuerBase}/`)) {
				return { ok: false, reason: 'issuer_not_allowed' }
			}

			const jwks = (await getJson(`${issuerBase}/.well-known/ots/jwks.json`, 6_000)) as {
				keys?: Array<Record<string, unknown>>
			} | null
			if (!jwks?.keys?.length) return { ok: false, reason: 'jwks_unreachable' }

			const key = header.kid
				? jwks.keys.find((candidate) => candidate.kid === header.kid)
				: jwks.keys[0]
			if (!key) return { ok: false, reason: 'unknown_kid' }

			let signatureValid = false
			try {
				const publicKey = createPublicKey({ key: key as never, format: 'jwk' })
				signatureValid = cryptoVerify(
					null,
					Buffer.from(`${parts[0]}.${parts[1]}`),
					publicKey,
					Buffer.from(parts[2], 'base64url'),
				)
			} catch {
				signatureValid = false
			}
			if (!signatureValid) return { ok: false, reason: 'bad_signature' }

			if (claims.exp != null && claims.exp * 1000 < Date.now()) {
				return { ok: false, reason: 'expired' }
			}

			// Sem emailHash não há como ligar o documento à pessoa — e a ameaça
			// nº 2 da spec é exatamente replay em outra pessoa.
			const emailHash = claims.subject?.emailHash ?? null
			if (!emailHash || !candidateEmail) return { ok: false, reason: 'subject_mismatch' }
			const expectedHash = `sha256:${createHash('sha256')
				.update(candidateEmail.trim().toLowerCase())
				.digest('hex')}`
			if (emailHash !== expectedHash) return { ok: false, reason: 'subject_mismatch' }

			const status = (await getJson(claims.statusUrl, 6_000)) as { status?: string } | null
			if (status?.status === 'revoked') return { ok: false, reason: 'revoked' }

			return {
				ok: true,
				attestation: {
					jws: jws.trim(),
					jti: claims.jti,
					iss: claims.iss,
					tier: claims.tier,
					subjectEmailMatches: true,
					companyName: claims.process?.companyName ?? null,
					jobTitle: claims.process?.jobTitle ?? null,
					completedAt: claims.interview.completedAt,
					questionsTotal: claims.interview.questionsTotal ?? null,
					outcome: claims.outcome
						? {
								score: claims.outcome.score ?? null,
								strengths: claims.outcome.strengths ?? [],
								developmentAreas: claims.outcome.developmentAreas ?? [],
							}
						: null,
					expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
					statusUrl: claims.statusUrl,
					revocationStatus: status?.status === 'valid' ? 'valid' : 'unknown',
					verifiedAt: new Date().toISOString(),
				},
			}
		},
	}
}

export type OtsVerificationService = ReturnType<typeof createOtsVerificationService>
