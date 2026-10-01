import type { Nps } from '@coploy/domain'

import type { NpsRepository } from '../../../interfaces/repositories/nps-repository'
import type { DrizzleDb } from '../db/client'
import { NpsRepositorySchema } from '../../shared/repository-schemas'
import {
	buildListParams, cast, castWithSchema, cleanForDb, eq,
	postProcess, randomUUID, schema, toJsonSafe,
} from './helpers'

/**
 * Pesquisa de satisfação do candidato.
 *
 * Separado do repositório de cobrança em 2026-08-29: NPS é sinal de produto, e
 * estava dentro de `billing` por acaso de arquivo — quem só queria a pesquisa
 * carregava junto o modelo comercial.
 */
export function createDrizzleNpsRepository(db: DrizzleDb): NpsRepository {
	return {
		async listNps(companyId, options) {
			const staticConds = [eq(schema.nps.company_id, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.nps, {}, staticConds, options)
			let query = db.select().from(schema.nps).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) => castWithSchema<Nps>(postProcess(schema.nps, r as Record<string, unknown>), NpsRepositorySchema))
		},
		async createNps(companyId, data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.nps, { ...payload, company_id: companyId })
			await db.insert(schema.nps).values({ id, ...cleaned } as typeof schema.nps.$inferInsert)
			return castWithSchema<Nps>({ ...payload, id }, NpsRepositorySchema)
		},
	}
}
