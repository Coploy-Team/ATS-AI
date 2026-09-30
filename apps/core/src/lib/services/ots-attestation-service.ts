import {
	createHash,
	createPrivateKey,
	createPublicKey,
	randomBytes,
	sign as cryptoSign,
	type KeyObject,
} from 'node:crypto'

import type { InfraProvider } from '@coploy/infra'
import type { JobApplied, OtsAttestation, OtsAttestationTier } from '@coploy/domain'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { env } from '@/env'
import { buildFeedback } from './candidate-interviews-service'

/**
 * Emissão do attestation OTS 0.2 — o registro portátil e verificável de que
 * uma entrevista aconteceu (spec-0.2 + decisões de governança de
 * 2026-08-21).
 *
 * O que este service GARANTE, porque o padrão promete:
 * - Emissão é ato do TALENTO, sobre entrevista dele e concluída. O tier (o
 *   quanto divulgar) e a validade são escolha dele no ato.
 * - O payload nunca carrega resposta, transcrição, mídia ou veredito da
 *   empresa (`approved`) — nem os atributos protegidos. O conteúdo
 *   qualitativo é o MESMO feedback que o candidato já vê em
 *   `/interviews/mine`; o documento não conta uma história diferente da tela.
 * - Verificação é offline (JWKS público em {iss}/.well-known/ots/jwks.json);
 *   a única consulta online é a revogação, pública e sem auth.
 * - Revogar é do talento e é permanente.
 *
 * Chave: Ed25519 privada em PEM PKCS#8 via `OTS_SIGNING_KEY` (secret
 * manager). Sem chave configurada a emissão desliga (as rotas respondem 503
 * com instrução), mas status/listagem continuam — documento já emitido não
 * pode ficar inconsultável porque a env sumiu.
 */

const DEFAULT_VALIDITY_DAYS = 730 // decisão de governança: padrão 2 anos
const DAY_MS = 24 * 60 * 60 * 1000

export interface EmitAttestationInput {
	jobAppliedId: string
	tier: OtsAttestationTier
	/** Dias de validade; null = não expira (só revoga). Omitido = default 2 anos. */
	expiresInDays?: number | null
}

export interface AttestationSummary {
	jti: string
	tier: OtsAttestationTier
	jws: string
	statusUrl: string
	issuedAt: string
	expiresAt: string | null
	revokedAt: string | null
	companyName: string | null
	jobTitle: string | null
}

function base64url(input: Buffer | string): string {
	return Buffer.from(input).toString('base64url')
}

function toIso(value: unknown): string | null {
	if (!value) return null
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'string') {
		const parsed = new Date(value)
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
	}
	const timestamp = value as { toDate?: () => Date; _seconds?: number; seconds?: number }
	if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString()
	const seconds = timestamp._seconds ?? timestamp.seconds
	return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

/**
 * Score agregado 0–10 pro tier `full`. O dado real guarda `score` como string
 * ("7.5") ou número; docs muito antigos chegam em 0–100. Fora disso, null —
 * attestation com nota inventada é pior que sem nota.
 */
function normalizeScore(raw: JobApplied['score']): number | null {
	const value = typeof raw === 'string' ? Number.parseFloat(raw) : raw
	if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return null
	const scaled = value > 10 && value <= 100 ? value / 10 : value
	if (scaled > 10) return null
	return Math.round(scaled * 10) / 10
}

function loadPrivateKey(): KeyObject | null {
	if (!env.OTS_SIGNING_KEY || !env.OTS_ISSUER_BASE_URL) return null
	try {
		// A env pode chegar com `\n` escapado (mesmo tratamento da chave Firebase).
		return createPrivateKey(env.OTS_SIGNING_KEY.replace(/\\n/g, '\n'))
	} catch {
		return null
	}
}

function decodePayload(jws: string): Record<string, unknown> | null {
	try {
		const payload = jws.split('.')[1]
		if (!payload) return null
		return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
	} catch {
		return null
	}
}

function toSummary(record: OtsAttestation, statusUrl: string): AttestationSummary {
	// O contexto de processo vive no próprio documento — decodificar evita
	// re-buscar empresa/vaga (e evita divergir do que foi assinado).
	const payload = decodePayload(record.jws)
	const process = (payload?.process ?? {}) as { companyName?: string | null; jobTitle?: string | null }
	return {
		jti: record.id,
		tier: record.tier,
		jws: record.jws,
		statusUrl,
		issuedAt: record.issuedAt.toISOString(),
		expiresAt: record.expiresAt?.toISOString() ?? null,
		revokedAt: record.revokedAt?.toISOString() ?? null,
		companyName: process.companyName ?? null,
		jobTitle: process.jobTitle ?? null,
	}
}

export function createOtsAttestationService(infra: InfraProvider) {
	const statusUrlFor = (jti: string) =>
		`${env.OTS_ISSUER_BASE_URL ?? ''}/ots/attestations/${jti}/status`

	return {
		/** Emissão precisa de chave + issuer; leitura de status nunca depende disso. */
		isConfigured(): boolean {
			return loadPrivateKey() !== null
		},

		async emit(userId: string, input: EmitAttestationInput): Promise<AttestationSummary> {
			const privateKey = loadPrivateKey()
			if (!privateKey) {
				throw new BadRequestError('OTS attestation emission is not configured on this server')
			}

			// Buscar SOB o userId é o que garante a posse: entrevista de outra
			// pessoa simplesmente não existe neste caminho.
			const jobApplied = await infra.candidateRepository
				.getJobApplied(userId, input.jobAppliedId)
				.catch(() => null)
			if (!jobApplied) throw new NotFoundError('Interview not found')
			if (jobApplied.finished !== true) {
				throw new BadRequestError('Only finished interviews can be attested')
			}

			const completedAt = toIso(jobApplied.finishedTime) ?? toIso(jobApplied.appliedTime)
			if (!completedAt) {
				throw new BadRequestError('Interview has no completion date to attest')
			}

			const jobId = jobApplied.jobApplied?.id ?? null
			const companyId = jobApplied.companyOwner?.id ?? null
			const [job, company, user] = await Promise.all([
				jobId && companyId
					? infra.jobRepository.getJob(companyId, jobId).catch(() => null)
					: null,
				companyId ? infra.companyRepository.getCompany(companyId).catch(() => null) : null,
				infra.userRepository.getUser(userId).catch(() => null),
			])

			const email = (user as { email?: string | null } | null)?.email ?? null
			const displayName =
				(user as { display_name?: string | null; name?: string | null } | null)?.display_name ??
				(user as { name?: string | null } | null)?.name ??
				null

			const validityDays =
				input.expiresInDays === undefined ? DEFAULT_VALIDITY_DAYS : input.expiresInDays
			if (validityDays !== null && (validityDays < 1 || validityDays > 3650)) {
				throw new BadRequestError('expiresInDays must be between 1 and 3650, or null')
			}

			const issuedAt = new Date()
			const expiresAt = validityDays === null ? null : new Date(issuedAt.getTime() + validityDays * DAY_MS)
			const jti = randomBytes(16).toString('base64url')

			// Tier summary: o MESMO feedback da tela do candidato. Tier full soma o
			// score agregado — nunca as respostas.
			const feedback = input.tier === 'existence' ? null : buildFeedback(jobApplied)
			const outcome =
				input.tier === 'existence'
					? null
					: {
							score: input.tier === 'full' ? normalizeScore(jobApplied.score) : null,
							strengths: feedback?.strengths ?? [],
							developmentAreas: feedback?.development ?? [],
						}

			const questionsTotal = jobApplied.interview?.info?.length ?? null

			const claims = {
				iss: env.OTS_ISSUER_BASE_URL,
				sub: userId,
				jti,
				iat: Math.floor(issuedAt.getTime() / 1000),
				exp: expiresAt ? Math.floor(expiresAt.getTime() / 1000) : null,
				ots_version: '0.2',
				tier: input.tier,
				subject: {
					displayName,
					emailHash: email
						? `sha256:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`
						: null,
				},
				process: {
					// Vaga-espelho da entrevista de perfil não tem empresa contratando
					// do outro lado — pôr o nome da hospedeira mentiria o contexto.
					companyName: job?.profileInterview === true ? null : (company?.companyName ?? null),
					jobTitle: jobApplied.jobName ?? job?.jobName ?? null,
					processEntryId: null,
				},
				interview: {
					completedAt,
					mode: jobApplied.typeInterview ?? null,
					language: jobApplied.language ?? jobApplied.evaluationLanguage ?? null,
					questionsTotal,
					durationSeconds: null,
				},
				outcome,
				statusUrl: statusUrlFor(jti),
			}

			const header = { alg: 'EdDSA', typ: 'ots-attestation+jws', kid: env.OTS_SIGNING_KID }
			const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
			// Ed25519 no node:crypto: algoritmo null — a curva define o hash.
			const signature = cryptoSign(null, Buffer.from(signingInput), privateKey)
			const jws = `${signingInput}.${signature.toString('base64url')}`

			await infra.otsAttestationRepository.createAttestation({
				id: jti,
				userId,
				jobAppliedId: input.jobAppliedId,
				companyId,
				jobId,
				tier: input.tier,
				kid: env.OTS_SIGNING_KID,
				jws,
				issuedAt,
				expiresAt,
				revokedAt: null,
			})

			return toSummary(
				{
					id: jti,
					userId,
					jobAppliedId: input.jobAppliedId,
					companyId,
					jobId,
					tier: input.tier,
					kid: env.OTS_SIGNING_KID,
					jws,
					issuedAt,
					expiresAt,
					revokedAt: null,
				},
				statusUrlFor(jti),
			)
		},

		async listMine(userId: string): Promise<AttestationSummary[]> {
			const records = await infra.otsAttestationRepository.listAttestationsByUser(userId)
			return records.map((record) => toSummary(record, statusUrlFor(record.id)))
		},

		/**
		 * Consulta pública de revogação (o statusUrl). `unknown` para jti que o
		 * servidor não reconhece — sem revelar se algum dia existiu. Expiração
		 * não entra aqui: o verificador a checa no próprio payload (`exp`).
		 */
		async status(jti: string): Promise<{
			jti: string
			status: 'valid' | 'revoked' | 'unknown'
			revokedAt: string | null
			checkedAt: string
		}> {
			const record = await infra.otsAttestationRepository.getAttestation(jti).catch(() => null)
			return {
				jti,
				status: !record ? 'unknown' : record.revokedAt ? 'revoked' : 'valid',
				revokedAt: record?.revokedAt?.toISOString() ?? null,
				checkedAt: new Date().toISOString(),
			}
		},

		async revoke(userId: string, jti: string): Promise<void> {
			const ok = await infra.otsAttestationRepository.revokeAttestation(jti, userId)
			// "Não existe" e "não é seu" são a mesma resposta, de propósito.
			if (!ok) throw new NotFoundError('Attestation not found')
		},

		/**
		 * JWKS público do emissor — {iss}/.well-known/ots/jwks.json. Só chaves
		 * PÚBLICAS saem daqui. Rotação: chave antiga permanece publicada enquanto
		 * houver attestation vivo assinado por ela (hoje há uma; a lista existe
		 * pra rotação futura não mudar o shape).
		 */
		jwks(): { keys: Array<Record<string, unknown>> } {
			const privateKey = loadPrivateKey()
			if (!privateKey) return { keys: [] }
			const jwk = createPublicKey(privateKey).export({ format: 'jwk' })
			return {
				keys: [{ ...jwk, kid: env.OTS_SIGNING_KID, use: 'sig', alg: 'EdDSA' }],
			}
		},
	}
}

export type OtsAttestationService = ReturnType<typeof createOtsAttestationService>
