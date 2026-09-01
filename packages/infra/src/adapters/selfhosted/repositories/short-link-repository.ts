import type { ShortLink } from '@coploy/domain'
import type { ShortLinkRepository } from "../../../interfaces/repositories/short-link-repository";
import type { DrizzleDb } from "../db/client";
import { ShortLinkRepositorySchema } from '../../shared/repository-schemas'
import {
	applyPatch,
	buildListParams,
	cleanForDb,
	eq,
	postProcess,
	randomUUID,
	schema,
	toJsonSafe,
	cast, castWithSchema,
} from "./helpers";

export function createDrizzleShortLinkRepository(
	db: DrizzleDb,
): ShortLinkRepository {
	return {
		async getShortLink(code) {
			const rows = await db
				.select()
				.from(schema.shortLinks)
				.where(eq(schema.shortLinks.id, code))
				.limit(1);
			if (!rows.length) return null;
			return castWithSchema<ShortLink>(postProcess(schema.shortLinks, rows[0] as Record<string, unknown>), ShortLinkRepositorySchema);
		},
		async listShortLinks(options) {
			const { where, orderBy, limit } = buildListParams(
				schema.shortLinks,
				{},
				[],
				options,
			);
			let query = db.select().from(schema.shortLinks).$dynamic();
			if (where) query = query.where(where);
			if (orderBy) query = query.orderBy(orderBy);
			if (limit) query = query.limit(limit);
			const rows = await query;
			return rows.map((r) => castWithSchema<ShortLink>(
				postProcess(schema.shortLinks, r as Record<string, unknown>),
				ShortLinkRepositorySchema,
			));
		},
		async createShortLink(code, data) {
			const payload = cast<Record<string, unknown>>(toJsonSafe(data));
			const cleaned = cleanForDb(schema.shortLinks, { ...payload, code });
			await db
				.insert(schema.shortLinks)
				.values({
					id: code,
					code,
					...cleaned,
				} as typeof schema.shortLinks.$inferInsert)
				.onConflictDoNothing();
			return { ...payload, id: code };
		},
		async updateShortLink(code, data) {
			const rows = await db
				.select()
				.from(schema.shortLinks)
				.where(eq(schema.shortLinks.id, code))
				.limit(1);
			if (!rows.length) return;
			const current = postProcess(
				schema.shortLinks,
				rows[0] as Record<string, unknown>,
			);
			const patched = applyPatch(current, data);
			const cleaned = cleanForDb(schema.shortLinks, patched);
			await db
				.update(schema.shortLinks)
				.set(cleaned as typeof schema.shortLinks.$inferInsert)
				.where(eq(schema.shortLinks.id, code));
		},
	};
}
