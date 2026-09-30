import type { GlobalSettings } from '@coploy/domain'

export interface GlobalSettingsRepository {
	/** Sempre retorna um objeto (vazio se nunca foi setado). */
	get(): Promise<GlobalSettings>
	/** Patch parcial. Retorna o estado completo após o update. */
	update(patch: Partial<GlobalSettings>, updatedBy: string): Promise<GlobalSettings>
}
