import type { OtsAttestation } from '@coploy/domain'

export interface OtsAttestationRepository {
	createAttestation(record: OtsAttestation): Promise<void>
	/** Por jti. É o que o statusUrl consulta — sem auth, então nunca vaza além do necessário. */
	getAttestation(jti: string): Promise<OtsAttestation | null>
	listAttestationsByUser(userId: string): Promise<OtsAttestation[]>
	/**
	 * Marca revogado. Só o DONO revoga (ADR-006, decisão 6) — a checagem de
	 * userId acontece aqui, no mesmo comando, pra não haver janela entre ler e
	 * gravar. Idempotente: revogar de novo devolve true. False = não existe ou
	 * não é dele (indistinguível de propósito).
	 */
	revokeAttestation(jti: string, userId: string): Promise<boolean>
}
