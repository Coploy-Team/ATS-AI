import type { MotorLicense } from '@coploy/domain'

/**
 * Licenças do plugin Motor — lado servidor (ADR-008). Só a instalação da
 * Coploy usa na prática (a rota de ativação vive no agregador saas-internal
 * e o espelho público não a carrega), mas o repositório existe nos dois
 * adapters como todos os outros.
 */
export interface MotorLicenseRepository {
	/** `keyHash` = SHA-256 hex da chave. Null quando não existe. */
	getByKeyHash(keyHash: string): Promise<MotorLicense | null>
	/** Heartbeat: atualiza lastSeenAt/instance sem tocar no resto. */
	touch(
		keyHash: string,
		patch: { lastSeenAt: Date; instance?: MotorLicense['instance'] },
	): Promise<void>
}
