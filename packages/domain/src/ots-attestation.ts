/**
 * Registro de emissão de um attestation OTS 0.2 (spec-0.2).
 *
 * O documento que viaja é o JWS — este registro existe para revogação
 * (`statusUrl` consulta por jti), listagem pelo dono e re-download. Revogar é
 * do TALENTO (ADR-006, decisão 6): o provedor executa a pedido, e revogado é
 * permanente.
 */

export type OtsAttestationTier = 'existence' | 'summary' | 'full'

/**
 * Snapshot de um attestation APRESENTADO pelo candidato e verificado por NÓS
 * (lado do consumo — decisão 6 do ADR-007). Gravado no JobApplied no apply.
 *
 * O snapshot existe porque a verificação tem custo e contexto (JWKS do
 * emissor, statusUrl): o dossiê mostra o que foi verificado E QUANDO; quem
 * quiser re-checar tem o `jws` e o `statusUrl` completos aqui.
 */
export interface VerifiedOtsAttestation {
	/** O documento inteiro — re-verificável por qualquer um, a qualquer hora. */
	jws: string
	jti: string
	/** O emissor — a âncora de confiança federada (quem CONDUZIU a entrevista). */
	iss: string
	tier: OtsAttestationTier
	/** O e-mail do candidato bateu com o subject.emailHash do documento. */
	subjectEmailMatches: boolean
	companyName: string | null
	jobTitle: string | null
	completedAt: string
	questionsTotal: number | null
	outcome: {
		score: number | null
		strengths: string[]
		developmentAreas: string[]
	} | null
	expiresAt: string | null
	statusUrl: string
	/** Resultado da consulta de revogação NO ATO da verificação. */
	revocationStatus: 'valid' | 'unknown'
	verifiedAt: string
}

export interface OtsAttestation {
	/** O `jti` do JWS — chave de revogação. */
	id: string
	userId: string
	jobAppliedId: string
	companyId: string | null
	jobId: string | null
	tier: OtsAttestationTier
	/** Chave que assinou — permite rotação sem invalidar documentos vivos. */
	kid: string
	/** O documento completo, para o dono baixar de novo. */
	jws: string
	issuedAt: Date
	/** Null = não expira, só revoga (escolha do talento na emissão). */
	expiresAt: Date | null
	revokedAt: Date | null
}
