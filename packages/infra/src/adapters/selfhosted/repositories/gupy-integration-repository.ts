import type { GupyIntegration } from '@coploy/domain'
import type { GupyIntegrationRepository } from '../../../interfaces/repositories/gupy-integration-repository'
import type { DrizzleDb } from '../db/client'
import { GupyIntegrationRepositorySchema } from '../../shared/repository-schemas'
import { applyPatch, cast, castWithSchema, cleanForDb, eq, postProcess, randomUUID, schema, toJsonSafe } from './helpers'
import { encryptField, decryptField } from '../../shared/crypto'

function encryptGupyToken<T extends { gupyApiToken?: string | null }>(data: T): T {
	if (data.gupyApiToken != null) {
		return { ...data, gupyApiToken: encryptField(data.gupyApiToken) as string }
	}
	return data
}

function decryptGupyIntegration(doc: GupyIntegration): GupyIntegration {
	if (doc.gupyApiToken != null) {
		return { ...doc, gupyApiToken: decryptField(doc.gupyApiToken) as string }
	}
	return doc
}

export function createDrizzleGupyIntegrationRepository(
	db: DrizzleDb,
): GupyIntegrationRepository {
	return {
		async listGupyIntegrations(companyId) {
			const rows = await db
				.select()
				.from(schema.gupyIntegrations)
				.where(eq(schema.gupyIntegrations.companyId, companyId))
			return rows.map((r) =>
				decryptGupyIntegration(
					castWithSchema<GupyIntegration>(
						postProcess(schema.gupyIntegrations, r as Record<string, unknown>),
						GupyIntegrationRepositorySchema,
					),
				),
			)
		},
		async getGupyIntegration(id) {
			const rows = await db
				.select()
				.from(schema.gupyIntegrations)
				.where(eq(schema.gupyIntegrations.id, id))
				.limit(1)
			if (!rows.length) return null
			return decryptGupyIntegration(
				castWithSchema<GupyIntegration>(
					postProcess(schema.gupyIntegrations, rows[0] as Record<string, unknown>),
					GupyIntegrationRepositorySchema,
				),
			)
		},
		async createGupyIntegration(data, customId) {
			const id = customId ?? randomUUID()
			const encrypted = encryptGupyToken(data)
			const payload = cast<Record<string, unknown>>(toJsonSafe(encrypted))
			const cleaned = cleanForDb(schema.gupyIntegrations, payload)
			await db
				.insert(schema.gupyIntegrations)
				.values({
					id,
					...cleaned,
				} as typeof schema.gupyIntegrations.$inferInsert)
				.onConflictDoNothing()
			return { ...payload, id }
		},
		async updateGupyIntegration(id, data) {
			const rows = await db
				.select()
				.from(schema.gupyIntegrations)
				.where(eq(schema.gupyIntegrations.id, id))
				.limit(1)
			if (!rows.length) return
			const current = postProcess(schema.gupyIntegrations, rows[0] as Record<string, unknown>)
			const patched = applyPatch(current, data)
			const encrypted = encryptGupyToken(patched as Partial<GupyIntegration>)
			const cleaned = cleanForDb(schema.gupyIntegrations, encrypted as Record<string, unknown>)
			await db
				.update(schema.gupyIntegrations)
				.set(cleaned as typeof schema.gupyIntegrations.$inferInsert)
				.where(eq(schema.gupyIntegrations.id, id))
		},
	}
}
