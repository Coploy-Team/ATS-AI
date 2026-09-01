import type { GlobalSettings } from '@coploy/domain'
import type { GlobalSettingsRepository } from '../../../interfaces/repositories/global-settings-repository'
import type { DrizzleDb } from '../db/client'
import { GlobalSettingsRepositorySchema } from '../../shared/repository-schemas'
import { eq, schema } from './helpers'

const SINGLETON_ID = 'singleton'

export function createDrizzleGlobalSettingsRepository(
	db: DrizzleDb,
): GlobalSettingsRepository {
	return {
		async get() {
			const rows = await db
				.select()
				.from(schema.globalSettings)
				.where(eq(schema.globalSettings.id, SINGLETON_ID))
				.limit(1)
			if (!rows.length) return {}
			const row = rows[0] as Record<string, unknown>
			return GlobalSettingsRepositorySchema.parse({
				errorAlertRecipients: row.errorAlertRecipients,
				smtp: row.smtp ?? null,
				motorPlugin: row.motorPlugin ?? null,
				updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
				updatedBy: row.updatedBy,
			}) as GlobalSettings
		},
		async update(patch, updatedBy) {
			/*
			 * PATCH de verdade: o contrato promete parcial, e a versão anterior
			 * sobrescrevia com null tudo que o patch não trouxe — e DESCARTAVA em
			 * silêncio campo sem coluna (o smtp da tela Servidor sumia no save;
			 * o mesmo gotcha do mapeamento campo a campo de sempre). Só chave
			 * PRESENTE no patch sobrepõe o estado atual.
			 */
			const current = await this.get()
			const now = new Date()
			const merged = {
				errorAlertRecipients:
					'errorAlertRecipients' in patch
						? (patch.errorAlertRecipients ?? null)
						: (current.errorAlertRecipients ?? null),
				smtp: 'smtp' in patch ? (patch.smtp ?? null) : (current.smtp ?? null),
				motorPlugin:
					'motorPlugin' in patch ? (patch.motorPlugin ?? null) : (current.motorPlugin ?? null),
			}
			await db
				.insert(schema.globalSettings)
				.values({ id: SINGLETON_ID, ...merged, updatedAt: now, updatedBy })
				.onConflictDoUpdate({
					target: schema.globalSettings.id,
					set: { ...merged, updatedAt: now, updatedBy },
				})
			return {
				...merged,
				updatedAt: now.toISOString(),
				updatedBy,
			}
		},
	}
}
