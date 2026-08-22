import type { MotorLicense } from '@coploy/domain'
import type { MotorLicenseRepository } from '../../../interfaces/repositories/motor-license-repository'
import type { DrizzleDb } from '../db/client'
import { eq, schema } from './helpers'

/**
 * Presente por paridade de adapters; na prática só a instalação da Coploy
 * (GCP) serve licenças — a rota de ativação não existe no espelho open.
 */
export function createDrizzleMotorLicenseRepository(db: DrizzleDb): MotorLicenseRepository {
	return {
		async getByKeyHash(keyHash) {
			const rows = await db
				.select()
				.from(schema.motorLicenses)
				.where(eq(schema.motorLicenses.id, keyHash))
				.limit(1)
			if (!rows.length) return null
			const row = rows[0]
			return {
				id: row.id,
				plan: row.plan ?? '',
				status: (row.status as MotorLicense['status']) ?? 'revoked',
				issuedTo: row.issuedTo ?? '',
				notes: row.notes ?? null,
				createdAt: row.createdAt ?? null,
				lastSeenAt: row.lastSeenAt ?? null,
				instance: (row.instance as MotorLicense['instance']) ?? null,
			}
		},
		async touch(keyHash, patch) {
			await db
				.update(schema.motorLicenses)
				.set({
					lastSeenAt: patch.lastSeenAt,
					...(patch.instance !== undefined ? { instance: patch.instance } : {}),
				})
				.where(eq(schema.motorLicenses.id, keyHash))
		},
	}
}
