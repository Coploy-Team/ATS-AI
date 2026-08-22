import type { Firestore } from "firebase-admin/firestore";
import type { SharedCandidateLinkRepository } from "../../../interfaces/repositories/shared-candidate-link-repository";
import type { SharedCandidateLink } from '@coploy/domain';
import { SharedCandidateLinkRepositorySchema } from '../../shared/repository-schemas'
import { mapDoc, normalizeDoc } from "./helpers";

export function createFirestoreSharedCandidateLinkRepository(
	db: Firestore,
): SharedCandidateLinkRepository {
	return {
		async create(data) {
			const code = data.code
			await db.collection("sharedCandidateLinks").doc(code).set(data);
			return normalizeDoc({ ...data, id: code }) as unknown as SharedCandidateLink & { code: string };
		},
		async getByCode(code) {
			const doc = await db.collection("sharedCandidateLinks").doc(code).get();
			return mapDoc<SharedCandidateLink>(doc, SharedCandidateLinkRepositorySchema);
		},
	};
}
