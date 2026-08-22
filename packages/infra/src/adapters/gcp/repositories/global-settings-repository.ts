import type { Firestore } from 'firebase-admin/firestore'
import type { GlobalSettings } from '@coploy/domain'
import type { GlobalSettingsRepository } from '../../../interfaces/repositories/global-settings-repository'
import { GlobalSettingsRepositorySchema } from '../../shared/repository-schemas'
import { normalizeDoc } from './helpers'

const COLLECTION = 'globalSettings'
const DOC_ID = 'singleton'

/**
 * O `optionalDate` do schema compartilhado faz preprocess pra `Date` no
 * parse — mas o domain `GlobalSettings.updatedAt` é `string` (ISO). Convertemos
 * de volta na borda pra manter o contrato com o domain (e com o response
 * schema das rotas que valida string).
 */
function toIso(value: unknown): string | null {
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'string') return value
	return null
}

function asGlobalSettings(raw: Record<string, unknown>): GlobalSettings {
	const parsed = GlobalSettingsRepositorySchema.parse(raw)
	return {
		errorAlertRecipients: parsed.errorAlertRecipients ?? null,
		// campos da tela Servidor (open) — o mapeamento aqui é campo a campo,
		// então omitir seria o gotcha de sempre (gravado e sumido na leitura)
		smtp: parsed.smtp ?? null,
		motorPlugin: parsed.motorPlugin ?? null,
		updatedAt: toIso(parsed.updatedAt),
		updatedBy: parsed.updatedBy ?? null,
	}
}

export function createFirestoreGlobalSettingsRepository(
	db: Firestore,
): GlobalSettingsRepository {
	return {
		async get() {
			const doc = await db.collection(COLLECTION).doc(DOC_ID).get()
			if (!doc.exists) return {}
			const data = normalizeDoc(doc.data() ?? {}) as Record<string, unknown>
			return asGlobalSettings(data)
		},
		async update(patch, updatedBy) {
			const ref = db.collection(COLLECTION).doc(DOC_ID)
			const payload = {
				...patch,
				updatedAt: new Date().toISOString(),
				updatedBy,
			}
			await ref.set(payload, { merge: true })
			const after = await ref.get()
			const data = normalizeDoc(after.data() ?? {}) as Record<string, unknown>
			return asGlobalSettings(data)
		},
	}
}
