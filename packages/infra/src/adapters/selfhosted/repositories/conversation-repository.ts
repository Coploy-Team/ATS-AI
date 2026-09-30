import type { ConversationContext } from '@coploy/domain'
import type { ConversationRepository } from "../../../interfaces/repositories/conversation-repository";
import type { DrizzleDb } from "../db/client";
import { ConversationContextRepositorySchema } from '../../shared/repository-schemas'
import {
	and,
	applyPatch,
	buildListParams,
	cleanForDb,
	castWithSchema,
	eq,
	postProcess,
	schema,
	toJsonSafe,
	cast,
} from "./helpers";
import { encryptField, decryptField } from '../../shared/crypto'

function makeContextId(phone: string, jobId: string): string {
	return `${phone}__${jobId}`;
}

function encryptPassword<T extends { password?: string | null }>(data: T): T {
	if (data.password != null) {
		return { ...data, password: encryptField(data.password) as string }
	}
	return data
}

function decryptContext(doc: ConversationContext): ConversationContext {
	if (doc.password != null) {
		return { ...doc, password: decryptField(doc.password) as string }
	}
	return doc
}

export function createDrizzleConversationRepository(
	db: DrizzleDb,
): ConversationRepository {
	return {
		async getConversationContext(phone, jobId) {
			const rows = await db
				.select()
				.from(schema.conversationContexts)
				.where(
					and(
						eq(schema.conversationContexts.phone, phone),
						eq(schema.conversationContexts.jobId, jobId),
					),
				)
				.limit(1);
			if (!rows.length) return null;
			return decryptContext(
				castWithSchema<ConversationContext>(postProcess(
					schema.conversationContexts,
					rows[0] as Record<string, unknown>,
				), ConversationContextRepositorySchema),
			);
		},
		async listConversationContexts(phone, options) {
			const staticConds = [eq(schema.conversationContexts.phone, phone)];
			const { where, orderBy, limit } = buildListParams(
				schema.conversationContexts,
				{},
				staticConds,
				options,
			);
			let query = db.select().from(schema.conversationContexts).$dynamic();
			if (where) query = query.where(where);
			if (orderBy) query = query.orderBy(orderBy);
			if (limit) query = query.limit(limit);
			const rows = await query;
			return rows.map((r) =>
				decryptContext(
					castWithSchema<ConversationContext>(
						postProcess(schema.conversationContexts, r as Record<string, unknown>),
						ConversationContextRepositorySchema,
					),
				),
			);
		},
		async listAllConversationContexts(options) {
			const { where, orderBy, limit } = buildListParams(
				schema.conversationContexts,
				{},
				[],
				options,
			);
			let query = db.select().from(schema.conversationContexts).$dynamic();
			if (where) query = query.where(where);
			if (orderBy) query = query.orderBy(orderBy);
			if (limit) query = query.limit(limit);
			const rows = await query;
			return rows.map((r) =>
				decryptContext(
					castWithSchema<ConversationContext>(
						postProcess(schema.conversationContexts, r as Record<string, unknown>),
						ConversationContextRepositorySchema,
					),
				),
			);
		},
		async createConversationContext(phone, jobId, data) {
			const id = makeContextId(phone, jobId);
			const encrypted = encryptPassword(data)
			const payload = cast<Record<string, unknown>>(toJsonSafe(encrypted));
			const cleaned = cleanForDb(schema.conversationContexts, {
				...payload,
				phone,
				jobId,
			});
			await db
				.insert(schema.conversationContexts)
				.values({
					id,
					phone,
					jobId,
					...cleaned,
				} as typeof schema.conversationContexts.$inferInsert)
				.onConflictDoUpdate({
					target: schema.conversationContexts.id,
					set: cleaned as typeof schema.conversationContexts.$inferInsert,
				});
			return { ...payload, id };
		},
		async updateConversationContext(phone, jobId, data) {
			const rows = await db
				.select()
				.from(schema.conversationContexts)
				.where(
					and(
						eq(schema.conversationContexts.phone, phone),
						eq(schema.conversationContexts.jobId, jobId),
					),
				)
				.limit(1);
			if (!rows.length) return;
			const current = postProcess(
				schema.conversationContexts,
				rows[0] as Record<string, unknown>,
			);
			const patched = applyPatch(current, data);
			const encrypted = encryptPassword(patched as Partial<ConversationContext>)
			const cleaned = cleanForDb(schema.conversationContexts, encrypted as Record<string, unknown>);
			await db
				.update(schema.conversationContexts)
				.set(cleaned as typeof schema.conversationContexts.$inferInsert)
				.where(
					and(
						eq(schema.conversationContexts.phone, phone),
						eq(schema.conversationContexts.jobId, jobId),
					),
				);
		},
		async deleteConversationContext(phone, jobId) {
			await db
				.delete(schema.conversationContexts)
				.where(
					and(
						eq(schema.conversationContexts.phone, phone),
						eq(schema.conversationContexts.jobId, jobId),
					),
				);
		},
	};
}
