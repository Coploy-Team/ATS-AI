import type { SharedCandidateLink } from '@coploy/domain'
import type { SharedCandidateLinkRepository } from "../../../interfaces/repositories/shared-candidate-link-repository";
import type { DrizzleDb } from "../db/client";
import { SharedCandidateLinkRepositorySchema } from '../../shared/repository-schemas'
import {
	cast, castWithSchema,
	cleanForDb,
	eq,
	postProcess,
	schema,
	toJsonSafe,
} from "./helpers";

export function createDrizzleSharedCandidateLinkRepository(
	db: DrizzleDb,
): SharedCandidateLinkRepository {
	return {
		async create(data) {
			const code = data.code
			const payload = cast<Record<string, unknown>>(toJsonSafe(data))
			const cleaned = cleanForDb(schema.sharedCandidateLinks, { ...payload, code })
			await db
				.insert(schema.sharedCandidateLinks)
				.values({
					id: code,
					...cleaned,
				} as typeof schema.sharedCandidateLinks.$inferInsert)
				.onConflictDoNothing();
			return { ...payload, id: code } as SharedCandidateLink & { code: string };
		},
		async getByCode(code) {
			const rows = await db
				.select()
				.from(schema.sharedCandidateLinks)
				.where(eq(schema.sharedCandidateLinks.id, code))
				.limit(1);
			if (!rows.length) return null;
			return castWithSchema<SharedCandidateLink>(
				postProcess(schema.sharedCandidateLinks, rows[0] as Record<string, unknown>),
				SharedCandidateLinkRepositorySchema,
			);
		},
	};
}
