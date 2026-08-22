import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto'

import { createOtsVerificationService } from '../ots-verification-service'

// Emissor de mentira com chave de VERDADE: os testes assinam e verificam
// Ed25519 real — o mock é só o transporte (fetch de JWKS/status).
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const jwk = publicKey.export({ format: 'jwk' })
const ISS = 'https://emissor.example'
const EMAIL = 'joao@example.com'

function b64(input: string): string {
	return Buffer.from(input).toString('base64url')
}

function signJws(claims: Record<string, unknown>, header?: Record<string, unknown>): string {
	const head = b64(
		JSON.stringify(header ?? { alg: 'EdDSA', typ: 'ots-attestation+jws', kid: 'k1' }),
	)
	const payload = b64(JSON.stringify(claims))
	const signature = cryptoSign(null, Buffer.from(`${head}.${payload}`), privateKey)
	return `${head}.${payload}.${signature.toString('base64url')}`
}

function baseClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		iss: ISS,
		sub: 'user-1',
		jti: 'jti-12345678',
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 3600,
		ots_version: '0.2',
		tier: 'summary',
		subject: {
			displayName: 'João',
			emailHash: `sha256:${createHash('sha256').update(EMAIL).digest('hex')}`,
		},
		process: { companyName: 'Outra Empresa', jobTitle: 'QA' },
		interview: { completedAt: '2026-08-01T12:00:00.000Z', questionsTotal: 3 },
		outcome: { score: null, strengths: ['Comunica bem'], developmentAreas: [] },
		statusUrl: `${ISS}/ots/attestations/jti-12345678/status`,
		...overrides,
	}
}

function serviceWith(responses: Record<string, unknown>) {
	const fetchJson = jest.fn(async (url: string) => {
		for (const [suffix, body] of Object.entries(responses)) {
			if (url.endsWith(suffix)) return body
		}
		return null
	})
	return { service: createOtsVerificationService({ fetchJson }), fetchJson }
}

const OK_RESPONSES = {
	'/.well-known/ots/jwks.json': { keys: [{ ...jwk, kid: 'k1' }] },
	'/status': { jti: 'jti-12345678', status: 'valid', checkedAt: 'x' },
}

describe('ots-verification-service', () => {
	it('accepts a valid attestation and snapshots what was verified', async () => {
		const { service } = serviceWith(OK_RESPONSES)
		const result = await service.verify(signJws(baseClaims()), EMAIL)
		if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
		expect(result.attestation.tier).toBe('summary')
		expect(result.attestation.subjectEmailMatches).toBe(true)
		expect(result.attestation.revocationStatus).toBe('valid')
		expect(result.attestation.companyName).toBe('Outra Empresa')
	})

	it('rejects a tampered payload (signature covers everything)', async () => {
		const { service } = serviceWith(OK_RESPONSES)
		const jws = signJws(baseClaims())
		const [head, , sig] = jws.split('.')
		const forged = `${head}.${b64(JSON.stringify(baseClaims({ tier: 'full' })))}.${sig}`
		const result = await service.verify(forged, EMAIL)
		expect(result).toEqual({ ok: false, reason: 'bad_signature' })
	})

	it("rejects when the email doesn't match the subject hash — and when there is no hash at all", async () => {
		const { service } = serviceWith(OK_RESPONSES)
		expect(await service.verify(signJws(baseClaims()), 'outra@pessoa.com')).toEqual({
			ok: false,
			reason: 'subject_mismatch',
		})
		expect(
			await service.verify(signJws(baseClaims({ subject: { emailHash: null } })), EMAIL),
		).toEqual({ ok: false, reason: 'subject_mismatch' })
	})

	it('rejects revoked and expired attestations', async () => {
		const revoked = serviceWith({
			...OK_RESPONSES,
			'/status': { status: 'revoked' },
		})
		expect(await revoked.service.verify(signJws(baseClaims()), EMAIL)).toEqual({
			ok: false,
			reason: 'revoked',
		})

		const { service } = serviceWith(OK_RESPONSES)
		const expired = baseClaims({ exp: Math.floor(Date.now() / 1000) - 60 })
		expect(await service.verify(signJws(expired), EMAIL)).toEqual({
			ok: false,
			reason: 'expired',
		})
	})

	it('status indisponível não derruba — vira revocationStatus unknown', async () => {
		const { service } = serviceWith({
			'/.well-known/ots/jwks.json': { keys: [{ ...jwk, kid: 'k1' }] },
		})
		const result = await service.verify(signJws(baseClaims()), EMAIL)
		if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
		expect(result.attestation.revocationStatus).toBe('unknown')
	})

	it('SSRF: emissor http não-local e statusUrl fora do iss são recusados sem fetch', async () => {
		const { service, fetchJson } = serviceWith(OK_RESPONSES)
		const httpIssuer = baseClaims({
			iss: 'http://10.0.0.5:8080',
			statusUrl: 'http://10.0.0.5:8080/status',
		})
		expect(await service.verify(signJws(httpIssuer), EMAIL)).toEqual({
			ok: false,
			reason: 'issuer_not_allowed',
		})
		const foreignStatus = baseClaims({ statusUrl: 'https://outro-host.example/status' })
		expect(await service.verify(signJws(foreignStatus), EMAIL)).toEqual({
			ok: false,
			reason: 'issuer_not_allowed',
		})
		expect(fetchJson).not.toHaveBeenCalled()
	})

	it('enforces tier rules from the schema (summary with score is invalid)', async () => {
		const { service } = serviceWith(OK_RESPONSES)
		const summaryComScore = baseClaims({
			outcome: { score: 9.1, strengths: [], developmentAreas: [] },
		})
		expect(await service.verify(signJws(summaryComScore), EMAIL)).toEqual({
			ok: false,
			reason: 'invalid_claims',
		})
	})

	it('rejects wrong header and malformed input', async () => {
		const { service } = serviceWith(OK_RESPONSES)
		expect(await service.verify('nao-e-um-jws', EMAIL)).toEqual({
			ok: false,
			reason: 'malformed',
		})
		const wrongTyp = signJws(baseClaims(), { alg: 'EdDSA', typ: 'JWT', kid: 'k1' })
		expect(await service.verify(wrongTyp, EMAIL)).toEqual({
			ok: false,
			reason: 'unsupported_header',
		})
	})
})
