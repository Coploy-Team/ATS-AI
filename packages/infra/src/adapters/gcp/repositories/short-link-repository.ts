import type { Firestore } from "firebase-admin/firestore";
import type { ShortLinkRepository } from "../../../interfaces/repositories/short-link-repository";
import type { ShortLink } from '@coploy/domain';
import { ShortLinkRepositorySchema } from '../../shared/repository-schemas'
import { applyFilters, mapDoc, mapDocsWithSchema, normalizeDoc } from "./helpers";

export function createFirestoreShortLinkRepository(
	db: Firestore,
): ShortLinkRepository {
	return {
		async getShortLink(code) {
			const doc = await db.collection("shortLinks").doc(code).get();
			return mapDoc<ShortLink>(doc, ShortLinkRepositorySchema);
		},
		async listShortLinks(options) {
			const queryRef = applyFilters(db.collection("shortLinks"), options);
			const snapshot = await queryRef.get();
			return mapDocsWithSchema<ShortLink>(snapshot, ShortLinkRepositorySchema);
		},
		async createShortLink(code, data) {
			await db.collection("shortLinks").doc(code).set(data);
			return normalizeDoc({ ...data, id: code }) as unknown as ShortLink & { id: string };
		},
		async updateShortLink(code, data) {
			await db.collection("shortLinks").doc(code).update(data);
		},
	};
}
