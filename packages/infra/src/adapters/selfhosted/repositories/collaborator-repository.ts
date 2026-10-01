import type { Collaborator } from '@coploy/domain'
import type { CollaboratorRepository } from '../../../interfaces/repositories/collaborator-repository'
import type { DrizzleDb } from '../db/client'
import { CollaboratorRepositorySchema } from '../../shared/repository-schemas'
import {
	and, applyPatch,
	buildListParams, castWithSchema, cleanForDb, eq, postProcess,
	randomUUID, schema, toJsonSafe,
	cast,
} from './helpers'

/**
 * GCP guarda `userRef` como ref no doc; aqui o elo é a coluna
 * `user_company_id`. Sem esta ponte o INSERT descartava o vínculo
 * (`cleanForDb` dropa o que não é coluna) e a leitura devolvia colaborador
 * sem `userRef` — a tela de Time quebrava no primeiro owner da distribuição
 * open.
 */
function decomposeCollaborator(doc: Record<string, unknown>): Record<string, unknown> {
	const out = { ...doc }
	const ref = doc.userRef as { id?: string } | string | null | undefined
	if (typeof ref === 'string' && ref) out.user_company_id = ref
	else if (ref && typeof ref === 'object' && ref.id) out.user_company_id = ref.id
	delete out.userRef
	return out
}

function assembleCollaborator(row: Record<string, unknown>): Record<string, unknown> {
	const userCompanyId = row.user_company_id as string | null | undefined
	return {
		...row,
		userRef: userCompanyId ? { id: userCompanyId } : null,
	}
}

export function createDrizzleCollaboratorRepository(db: DrizzleDb): CollaboratorRepository {
	return {
		async listCollaborators(companyId, options) {
			const staticConds = [eq(schema.collaborators.company_id, companyId)]
			const { where, orderBy, limit } = buildListParams(schema.collaborators, {}, staticConds, options)
			let query = db.select().from(schema.collaborators).$dynamic()
			if (where) query = query.where(where)
			if (orderBy) query = query.orderBy(orderBy)
			if (limit) query = query.limit(limit)
			const rows = await query
			return rows.map((r) =>
				castWithSchema<Collaborator>(
					assembleCollaborator(postProcess(schema.collaborators, r as Record<string, unknown>)),
					CollaboratorRepositorySchema,
				),
			)
		},

		async listAllCollaborators(opts) {
			const limit = opts?.limit ?? 500
			let query = db.select().from(schema.collaborators).$dynamic()
			if (opts?.companyId) {
				query = query.where(eq(schema.collaborators.company_id, opts.companyId))
			}
			const rows = await query.limit(limit)
			return rows.map((r) =>
				castWithSchema<Collaborator>(
					assembleCollaborator(postProcess(schema.collaborators, r as Record<string, unknown>)),
					CollaboratorRepositorySchema,
				),
			)
		},

		async getCollaborator(companyId, id) {
			const rows = await db.select().from(schema.collaborators)
				.where(and(eq(schema.collaborators.id, id), eq(schema.collaborators.company_id, companyId)))
				.limit(1)
			if (!rows.length) return null
			return castWithSchema<Collaborator>(assembleCollaborator(postProcess(schema.collaborators, rows[0] as Record<string, unknown>)), CollaboratorRepositorySchema)
		},

		async createCollaborator(companyId, data) {
			const id = randomUUID()
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(
				schema.collaborators,
				decomposeCollaborator({ ...payload, company_id: companyId }),
			)
			await db.insert(schema.collaborators).values({ id, ...cleaned } as typeof schema.collaborators.$inferInsert)
			return { ...payload, id }
		},

		async updateCollaborator(companyId, id, data) {
			const rows = await db.select().from(schema.collaborators)
				.where(and(eq(schema.collaborators.id, id), eq(schema.collaborators.company_id, companyId)))
				.limit(1)
			if (!rows.length) return
			const current = postProcess(schema.collaborators, rows[0] as Record<string, unknown>)
			const patched = applyPatch(current, data)
			const cleaned = cleanForDb(schema.collaborators, patched)
			await db.update(schema.collaborators).set(cleaned as typeof schema.collaborators.$inferInsert).where(eq(schema.collaborators.id, id))
		},

		async deleteCollaborator(_companyId, id) {
			await db.delete(schema.collaborators).where(eq(schema.collaborators.id, id))
		},
	}
}
