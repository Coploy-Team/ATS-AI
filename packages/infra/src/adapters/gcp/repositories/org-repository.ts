import type { Firestore } from 'firebase-admin/firestore'

import type { CustomFieldDefinition, EmailTemplate, OrgUnit } from '@coploy/domain'

import type { OrgRepository } from '../../../interfaces/repositories'
import { mapDoc, mapDocs } from './helpers'

export function createFirestoreOrgRepository(db: Firestore): OrgRepository {
	const units = (companyId: string) =>
		db.collection('companies').doc(companyId).collection('orgUnits')
	const fields = (companyId: string) =>
		db.collection('companies').doc(companyId).collection('customFields')
	const templates = (companyId: string) =>
		db.collection('companies').doc(companyId).collection('emailTemplates')

	return {
		async listOrgUnits(companyId) {
			const snapshot = await units(companyId).get()
			return mapDocs<OrgUnit>(snapshot)
		},
		async createOrgUnit(companyId, data) {
			const ref = await units(companyId).add({ ...data, createdAt: new Date() })
			return mapDoc<OrgUnit & { id: string }>(await ref.get())!
		},
		async updateOrgUnit(companyId, id, data) {
			await units(companyId)
				.doc(id)
				.update({ ...data, updatedAt: new Date() })
		},

		async listCustomFields(companyId) {
			const snapshot = await fields(companyId).get()
			return mapDocs<CustomFieldDefinition>(snapshot)
				.sort((a, b) => a.order - b.order)
		},
		async createCustomField(companyId, data) {
			const ref = await fields(companyId).add({ ...data, createdAt: new Date() })
			return mapDoc<CustomFieldDefinition & { id: string }>(await ref.get())!
		},
		async updateCustomField(companyId, id, data) {
			await fields(companyId).doc(id).update({ ...data })
		},

		async listEmailTemplates(companyId) {
			const snapshot = await templates(companyId).get()
			return mapDocs<EmailTemplate>(snapshot)
		},
		async upsertEmailTemplate(companyId, kind, data) {
			// o `kind` é o id: uma empresa tem UM template por tipo
			const ref = templates(companyId).doc(kind)
			await ref.set({ ...data, kind, updatedAt: new Date() }, { merge: true })
			return mapDoc<EmailTemplate & { id: string }>(await ref.get())!
		},
		async deleteEmailTemplate(companyId, kind) {
			await templates(companyId).doc(kind).delete()
		},
	}
}
