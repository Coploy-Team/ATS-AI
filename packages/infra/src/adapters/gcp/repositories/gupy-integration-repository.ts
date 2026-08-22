import type { Firestore } from "firebase-admin/firestore";
import type { GupyIntegrationRepository } from "../../../interfaces/repositories/gupy-integration-repository";
import type { GupyIntegration } from '@coploy/domain';
import { GupyIntegrationRepositorySchema } from '../../shared/repository-schemas'
import { mapDoc, mapDocsWithSchema, normalizeDoc } from "./helpers";
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

export function createFirestoreGupyIntegrationRepository(
	db: Firestore,
): GupyIntegrationRepository {
	return {
		async listGupyIntegrations(companyId) {
			const snapshot = await db
				.collection("gupyIntegrations")
				.where("companyId", "==", companyId)
				.get();
			return mapDocsWithSchema<GupyIntegration>(snapshot, GupyIntegrationRepositorySchema)
				.map(decryptGupyIntegration);
		},
		async getGupyIntegration(id) {
			const doc = await db.collection("gupyIntegrations").doc(id).get();
			const result = mapDoc<GupyIntegration>(doc, GupyIntegrationRepositorySchema);
			return result ? decryptGupyIntegration(result) : null;
		},
		async createGupyIntegration(data, customId) {
			const encrypted = encryptGupyToken(data);
			if (customId) {
				await db.collection("gupyIntegrations").doc(customId).set(encrypted);
				return normalizeDoc({ ...encrypted, id: customId }) as unknown as GupyIntegration & {
					id: string;
				};
			}
			const ref = await db.collection("gupyIntegrations").add(encrypted);
			return normalizeDoc({ ...encrypted, id: ref.id }) as unknown as GupyIntegration & {
				id: string;
			};
		},
		async updateGupyIntegration(id, data) {
			const encrypted = encryptGupyToken(data);
			await db.collection("gupyIntegrations").doc(id).update(encrypted);
		},
	};
}
