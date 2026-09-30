import { createPublicKey, verify } from 'node:crypto'

import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

// Chave Ed25519 REAL gerada por execução: os testes provam a assinatura de
// verdade (verify passa, byte adulterado derruba), não só o shape.
jest.mock('@/env', () => {
	const { generateKeyPairSync } = require('node:crypto')
	const { privateKey } = generateKeyPairSync('ed25519')
	return {
		env: {
			OTS_SIGNING_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
			OTS_SIGNING_KID: 'test-key-1',
			OTS_ISSUER_BASE_URL: 'https://api.example.test',
			INTERVIEW_BASE_URL: 'https://interview.example.test',
		},
	}
})

import { env } from '@/env'
import { createOtsAttestationService } from '../ots-attestation-service'
import { createMockInfra } from './mock-infra'

function decode(jws: string) {
	const [header, payload, signature] = jws.split('.')
	return {
		header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
		payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
		signature: Buffer.from(signature, 'base64url'),
		signingInput: `${header}.${payload}`,
	}
}

function publicKey() {
	return createPublicKey((env as { OTS_SIGNING_KEY?: string }).OTS_SIGNING_KEY as string)
}

const finishedJobApplied = {
	id: 'ja-1',
	finished: true,
	finishedTime: new Date('2026-08-01T12:00:00Z'),
	appliedTime: new Date('2026-07-30T09:00:00Z'),
	score: '7.5',
	jobName: 'Pessoa Desenvolvedora Backend',
	typeInterview: 'interview',
	language: 'pt-BR',
	companyOwner: { id: 'company-1' },
	jobApplied: { id: 'job-1' },
	interview: {
		info: [
			{ finished: true, strengths: ['Comunica bem'], improvement: ['Aprofundar métricas'] },
			{ finished: true, strengths: ['Exemplos concretos'], improvement: [] },
		],
		generalStrengths: ['Consistência técnica'],
	},
	avaliacaoFinal: {
		recomendacoes: { sugestoes_melhoria: ['Estudar observabilidade'] },
	},
}

function setupInfra() {
	const infra = createMockInfra()
	;(infra.candidateRepository.getJobApplied as jest.Mock).mockResolvedValue(finishedJobApplied)
	;(infra.jobRepository.getJob as jest.Mock).mockResolvedValue({
		jobName: 'Pessoa Desenvolvedora Backend',
		profileInterview: false,
	})
	;(infra.companyRepository.getCompany as jest.Mock).mockResolvedValue({
		companyName: 'Forkly Studio',
	})
	;(infra.userRepository.getUser as jest.Mock).mockResolvedValue({
		display_name: 'João Candidato',
		email: 'Joao.Candidato@Example.com ',
	})
	return infra
}

describe('ots-attestation-service', () => {
	it('emits a full-tier attestation with a verifiable Ed25519 signature', async () => {
		const infra = setupInfra()
		const service = createOtsAttestationService(infra)

		const result = await service.emit('user-1', { jobAppliedId: 'ja-1', tier: 'full' })

		const { header, payload, signature, signingInput } = decode(result.jws)
		expect(header).toEqual({ alg: 'EdDSA', typ: 'ots-attestation+jws', kid: 'test-key-1' })
		expect(payload.iss).toBe('https://api.example.test')
		expect(payload.sub).toBe('user-1')
		expect(payload.ots_version).toBe('0.2')
		expect(payload.tier).toBe('full')
		expect(payload.jti).toBe(result.jti)
		expect(payload.statusUrl).toBe(`https://api.example.test/ots/attestations/${result.jti}/status`)
		expect(payload.interview.completedAt).toBe('2026-08-01T12:00:00.000Z')
		expect(payload.interview.questionsTotal).toBe(2)
		expect(payload.process.companyName).toBe('Forkly Studio')
		expect(payload.outcome.score).toBe(7.5)
		expect(payload.outcome.strengths.length).toBeGreaterThan(0)
		// E-mail nunca em claro — hash do e-mail normalizado (trim + lowercase).
		expect(payload.subject.emailHash).toMatch(/^sha256:[0-9a-f]{64}$/)
		expect(result.jws).not.toContain('Joao.Candidato')

		expect(verify(null, Buffer.from(signingInput), publicKey(), signature)).toBe(true)

		expect(infra.otsAttestationRepository.createAttestation).toHaveBeenCalledWith(
			expect.objectContaining({ id: result.jti, userId: 'user-1', tier: 'full' }),
		)
		// Default de governança: 2 anos de validade.
		const days = (payload.exp - payload.iat) / 86400
		expect(Math.round(days)).toBe(730)
	})

	it('rejects a tampered payload on verification', async () => {
		const service = createOtsAttestationService(setupInfra())
		const result = await service.emit('user-1', { jobAppliedId: 'ja-1', tier: 'full' })

		const [header, payload, signature] = result.jws.split('.')
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
		claims.outcome.score = 9.9
		const forged = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`
		expect(
			verify(null, Buffer.from(forged), publicKey(), Buffer.from(signature, 'base64url')),
		).toBe(false)
	})

	it('existence tier carries no outcome at all', async () => {
		const service = createOtsAttestationService(setupInfra())
		const result = await service.emit('user-1', { jobAppliedId: 'ja-1', tier: 'existence' })
		expect(decode(result.jws).payload.outcome).toBeNull()
	})

	it('summary tier is qualitative: score stays null', async () => {
		const service = createOtsAttestationService(setupInfra())
		const result = await service.emit('user-1', { jobAppliedId: 'ja-1', tier: 'summary' })
		const { payload } = decode(result.jws)
		expect(payload.outcome.score).toBeNull()
		expect(payload.outcome.strengths).toContain('Comunica bem')
	})

	it('refuses unfinished interviews and unknown ones', async () => {
		const infra = setupInfra()
		const service = createOtsAttestationService(infra)

		;(infra.candidateRepository.getJobApplied as jest.Mock).mockResolvedValue({
			...finishedJobApplied,
			finished: false,
		})
		await expect(service.emit('user-1', { jobAppliedId: 'ja-1', tier: 'full' })).rejects.toThrow(
			BadRequestError,
		)

		;(infra.candidateRepository.getJobApplied as jest.Mock).mockResolvedValue(null)
		await expect(service.emit('user-1', { jobAppliedId: 'nope', tier: 'full' })).rejects.toThrow(
			NotFoundError,
		)
	})

	it('profile interview mirror never names the host company', async () => {
		const infra = setupInfra()
		;(infra.jobRepository.getJob as jest.Mock).mockResolvedValue({
			jobName: 'Perfil — Backend',
			profileInterview: true,
		})
		const service = createOtsAttestationService(infra)
		const result = await service.emit('user-1', { jobAppliedId: 'ja-1', tier: 'existence' })
		expect(decode(result.jws).payload.process.companyName).toBeNull()
	})

	it('maps status: unknown, valid and revoked — without leaking existence', async () => {
		const infra = setupInfra()
		const service = createOtsAttestationService(infra)

		expect((await service.status('missing-jti')).status).toBe('unknown')

		const base = {
			id: 'jti-1',
			userId: 'user-1',
			jobAppliedId: 'ja-1',
			companyId: null,
			jobId: null,
			tier: 'full' as const,
			kid: 'test-key-1',
			jws: 'a.b.c',
			issuedAt: new Date(),
			expiresAt: null,
		}
		;(infra.otsAttestationRepository.getAttestation as jest.Mock).mockResolvedValue({
			...base,
			revokedAt: null,
		})
		expect((await service.status('jti-1')).status).toBe('valid')

		;(infra.otsAttestationRepository.getAttestation as jest.Mock).mockResolvedValue({
			...base,
			revokedAt: new Date('2026-08-20T10:00:00Z'),
		})
		const revoked = await service.status('jti-1')
		expect(revoked.status).toBe('revoked')
		expect(revoked.revokedAt).toBe('2026-08-20T10:00:00.000Z')
	})

	it('revoke is owner-only: repository false becomes NotFound', async () => {
		const infra = setupInfra()
		const service = createOtsAttestationService(infra)
		await expect(service.revoke('user-2', 'jti-1')).rejects.toThrow(NotFoundError)
		;(infra.otsAttestationRepository.revokeAttestation as jest.Mock).mockResolvedValue(true)
		await expect(service.revoke('user-1', 'jti-1')).resolves.toBeUndefined()
	})

	it('publishes only the PUBLIC key in the JWKS', async () => {
		const service = createOtsAttestationService(setupInfra())
		const { keys } = service.jwks()
		expect(keys).toHaveLength(1)
		expect(keys[0]).toMatchObject({ kty: 'OKP', crv: 'Ed25519', kid: 'test-key-1', alg: 'EdDSA' })
		expect(keys[0].d).toBeUndefined()
	})
})
