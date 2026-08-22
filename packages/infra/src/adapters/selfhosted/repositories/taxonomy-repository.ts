import type { Occupation, Skill } from '@coploy/domain'

import type { TaxonomyRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { cast, eq, postProcess, schema, sql } from './helpers'

export function createSelfHostedTaxonomyRepository(db: DrizzleDb): TaxonomyRepository {
	return {
		async listOccupations(taxonomyVersion) {
			const query = db.select().from(schema.occupations)
			const rows = taxonomyVersion
				? await query.where(eq(schema.occupations.taxonomyVersion, taxonomyVersion))
				: await query
			return rows.map((row) =>
				cast<Occupation>(postProcess(schema.occupations, row as Record<string, unknown>)),
			)
		},
		async listSkills(taxonomyVersion) {
			const query = db.select().from(schema.skills)
			const rows = taxonomyVersion
				? await query.where(eq(schema.skills.taxonomyVersion, taxonomyVersion))
				: await query
			return rows.map((row) =>
				cast<Skill>(postProcess(schema.skills, row as Record<string, unknown>)),
			)
		},
		async upsertOccupations(items) {
			if (items.length === 0) return 0
			await db
				.insert(schema.occupations)
				.values(items as never)
				// recarregar atualiza, não duplica nem quebra
				.onConflictDoUpdate({
					target: schema.occupations.id,
					set: {
						title: sql`excluded.title`,
						synonyms: sql`excluded.synonyms`,
						taxonomyVersion: sql`excluded."taxonomyVersion"`,
					},
				})
			return items.length
		},
		async upsertSkills(items) {
			if (items.length === 0) return 0
			await db
				.insert(schema.skills)
				.values(items as never)
				.onConflictDoUpdate({
					target: schema.skills.id,
					set: {
						name: sql`excluded.name`,
						synonyms: sql`excluded.synonyms`,
						taxonomyVersion: sql`excluded."taxonomyVersion"`,
					},
				})
			return items.length
		},
		async recordPendingSkill(name, taxonomyVersion) {
			const id = `skill:${name}`
			await db
				.insert(schema.skills)
				.values({
					id,
					name,
					synonyms: [],
					source: 'curated',
					taxonomyVersion,
					pendingCuration: true,
					occurrences: 1,
				} as never)
				// já existe: só conta de novo, para priorizar a fila de curadoria
				.onConflictDoUpdate({
					target: schema.skills.id,
					set: { occurrences: sql`${schema.skills.occurrences} + 1` },
				})
		},
	}
}
