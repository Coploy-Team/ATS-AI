import { createHash } from 'node:crypto'

import {
	signToken,
	verifyToken,
	verifyPkceS256,
	type AccessTokenPayload,
	type CodeTokenPayload,
} from '../jwt'

const SECRET = 'test-secret-with-enough-entropy-123'

describe('oauth/jwt', () => {
	it('assina e verifica roundtrip preservando payload', () => {
		const token = signToken<AccessTokenPayload>(
			{ kind: 'access', uid: 'user-1', scope: 'candidate' },
			SECRET,
			60,
		)
		const claims = verifyToken<AccessTokenPayload>(token, SECRET, 'access')

		expect(claims).not.toBeNull()
		expect(claims?.uid).toBe('user-1')
		expect(claims?.scope).toBe('candidate')
		expect(claims?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
	})

	it('rejeita assinatura de outro secret', () => {
		const token = signToken<AccessTokenPayload>(
			{ kind: 'access', uid: 'user-1', scope: 'candidate' },
			SECRET,
			60,
		)
		expect(verifyToken<AccessTokenPayload>(token, 'outro-secret', 'access')).toBeNull()
	})

	it('rejeita token expirado', () => {
		const token = signToken<AccessTokenPayload>(
			{ kind: 'access', uid: 'user-1', scope: 'candidate' },
			SECRET,
			-10,
		)
		expect(verifyToken<AccessTokenPayload>(token, SECRET, 'access')).toBeNull()
	})

	it('rejeita kind errado (code não vale como access)', () => {
		const token = signToken<CodeTokenPayload>(
			{
				kind: 'code',
				uid: 'user-1',
				clientId: 'client-1',
				redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
				codeChallenge: 'abc',
				scope: 'candidate',
			},
			SECRET,
			60,
		)
		expect(verifyToken<AccessTokenPayload>(token, SECRET, 'access')).toBeNull()
	})

	it('rejeita token malformado e payload adulterado', () => {
		expect(verifyToken('nao-e-jwt', SECRET, 'access')).toBeNull()

		const token = signToken<AccessTokenPayload>(
			{ kind: 'access', uid: 'user-1', scope: 'candidate' },
			SECRET,
			60,
		)
		const [header, , signature] = token.split('.')
		const forgedBody = Buffer.from(
			JSON.stringify({ kind: 'access', uid: 'attacker', scope: 'candidate', iat: 0, exp: 9999999999 }),
		).toString('base64url')
		expect(verifyToken(`${header}.${forgedBody}.${signature}`, SECRET, 'access')).toBeNull()
	})

	describe('verifyPkceS256', () => {
		it('aceita par verifier/challenge válido (RFC 7636)', () => {
			const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
			const challenge = createHash('sha256').update(verifier).digest('base64url')
			expect(verifyPkceS256(verifier, challenge)).toBe(true)
		})

		it('rejeita verifier errado', () => {
			const challenge = createHash('sha256').update('verifier-a').digest('base64url')
			expect(verifyPkceS256('verifier-b', challenge)).toBe(false)
		})
	})
})
