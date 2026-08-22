import type { Firestore } from "firebase-admin/firestore";
import type { ConversationRepository } from "../../../interfaces/repositories/conversation-repository";
import type { ConversationContext } from '@coploy/domain';
import { ConversationContextRepositorySchema } from '../../shared/repository-schemas'
import { applyFilters, mapDoc, mapDocsWithSchema, normalizeDoc } from "./helpers";
import { encryptField, decryptField } from '../../shared/crypto'

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

export function createFirestoreConversationRepository(
	db: Firestore,
): ConversationRepository {
	return {
		async getConversationContext(phone, jobId) {
			const doc = await db
				.collection("conversationContexts")
				.doc(phone)
				.collection("interviews")
				.doc(jobId)
				.get();
			const result = mapDoc<ConversationContext>(doc, ConversationContextRepositorySchema);
			return result ? decryptContext(result) : null;
		},
		async listConversationContexts(phone, options) {
			const col = db
				.collection("conversationContexts")
				.doc(phone)
				.collection("interviews");
			const queryRef = applyFilters(col, options);
			const snapshot = await queryRef.get();
			return mapDocsWithSchema<ConversationContext>(snapshot, ConversationContextRepositorySchema)
				.map(decryptContext);
		},
		async listAllConversationContexts(options) {
			const phones = await db.collection("conversationContexts").listDocuments();
			const rows: ConversationContext[] = [];
			const limit = options?.limitTo ?? 500;
			for (const phoneDoc of phones.slice(0, 500)) {
				if (rows.length >= limit) break;
				const snapshot = await applyFilters(
					phoneDoc.collection("interviews"),
					options,
				).get();
				rows.push(...mapDocsWithSchema<ConversationContext>(snapshot, ConversationContextRepositorySchema));
			}
			return rows
				.map(decryptContext)
				.sort((a, b) => {
					const ad = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0
					const bd = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0
					return bd - ad
				})
				.slice(0, limit);
		},
		async createConversationContext(phone, jobId, data) {
			const encrypted = encryptPassword(data);
			await db
				.collection("conversationContexts")
				.doc(phone)
				.collection("interviews")
				.doc(jobId)
				.set(encrypted);
			return normalizeDoc({ ...encrypted, id: jobId }) as unknown as ConversationContext & { id: string };
		},
		async updateConversationContext(phone, jobId, data) {
			const encrypted = encryptPassword(data);
			await db
				.collection("conversationContexts")
				.doc(phone)
				.collection("interviews")
				.doc(jobId)
				.update(encrypted);
		},
		async deleteConversationContext(phone, jobId) {
			await db
				.collection("conversationContexts")
				.doc(phone)
				.collection("interviews")
				.doc(jobId)
				.delete();
		},
	};
}
