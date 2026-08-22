import type { Occupation, Skill } from '@coploy/domain'

/** Taxonomia de ocupações e skills (V2-801). Carga idempotente por id. */
export interface TaxonomyRepository {
	/**
	 * Lista tudo de uma versão. O `taxonomy-service` monta o índice em memória
	 * no boot: resolver cargo é operação de caminho quente, e ir ao banco a cada
	 * salvamento de vaga tornaria a normalização cara demais para ser default.
	 */
	listOccupations(taxonomyVersion?: string): Promise<Occupation[]>
	listSkills(taxonomyVersion?: string): Promise<Skill[]>
	/** Upsert em lote — rodar a carga de novo atualiza, não duplica. */
	upsertOccupations(items: Occupation[]): Promise<number>
	upsertSkills(items: Skill[]): Promise<number>
	/** Skill livre que apareceu e ainda não tem canônica. */
	recordPendingSkill(name: string, taxonomyVersion: string): Promise<void>
}
