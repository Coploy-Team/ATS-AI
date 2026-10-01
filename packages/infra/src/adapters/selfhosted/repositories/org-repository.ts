import { and, eq } from 'drizzle-orm'

import type {
	CustomFieldDefinition,
	CustomFieldEntity,
	CustomFieldType,
	EmailTemplate,
	EmailTemplateKind,
	OrgUnit,
	OrgUnitKind,
} from '@coploy/domain'

import type { OrgRepository } from '../../../interfaces/repositories'
import type { DrizzleDb } from '../db/client'
import { customFields, emailTemplates, orgUnits } from '../db/schema/tables'

export function createSelfHostedOrgRepository(db: DrizzleDb): OrgRepository {
	return {
		async listOrgUnits(companyId) {
			const rows = await db.select().from(orgUnits).where(eq(orgUnits.company_id, companyId))
			return rows.map((row) => ({
				id: row.id,
				companyId: row.company_id,
				kind: row.kind as OrgUnitKind,
				name: row.name,
				externalCode: row.externalCode,
				parentId: row.parentId,
				active: row.active ?? true,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			}))
		},

		async createOrgUnit(companyId, data) {
			const id = crypto.randomUUID()
			await db.insert(orgUnits).values({
				id,
				company_id: companyId,
				kind: data.kind as string,
				name: data.name as string,
				externalCode: (data.externalCode as string) ?? null,
				parentId: (data.parentId as string) ?? null,
				active: (data.active as boolean) ?? true,
			})
			const [row] = await db.select().from(orgUnits).where(eq(orgUnits.id, id)).limit(1)
			return {
				id: row.id,
				companyId: row.company_id,
				kind: row.kind as OrgUnitKind,
				name: row.name,
				externalCode: row.externalCode,
				parentId: row.parentId,
				active: row.active ?? true,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			} as OrgUnit & { id: string }
		},

		async updateOrgUnit(companyId, id, data) {
			await db
				.update(orgUnits)
				.set({
					...(data.name ? { name: data.name as string } : {}),
					...(data.active !== undefined ? { active: data.active as boolean } : {}),
					...(data.parentId !== undefined ? { parentId: (data.parentId as string) ?? null } : {}),
					updatedAt: new Date(),
				})
				.where(and(eq(orgUnits.company_id, companyId), eq(orgUnits.id, id)))
		},

		async listCustomFields(companyId) {
			const rows = await db
				.select()
				.from(customFields)
				.where(eq(customFields.company_id, companyId))
			return rows
				.map((row) => ({
					id: row.id,
					companyId: row.company_id,
					entity: row.entity as CustomFieldEntity,
					key: row.key,
					label: row.label,
					type: row.type as CustomFieldType,
					options: (row.options as string[]) ?? null,
					required: row.required ?? false,
					order: row.order ?? 0,
					active: row.active ?? true,
					createdAt: row.createdAt,
				}))
				.sort((a, b) => a.order - b.order)
		},

		async createCustomField(companyId, data) {
			const id = crypto.randomUUID()
			await db.insert(customFields).values({
				id,
				company_id: companyId,
				entity: data.entity as string,
				key: data.key as string,
				label: data.label as string,
				type: data.type as string,
				options: (data.options as string[]) ?? null,
				required: (data.required as boolean) ?? false,
				order: (data.order as number) ?? 0,
				active: (data.active as boolean) ?? true,
			})
			const [row] = await db.select().from(customFields).where(eq(customFields.id, id)).limit(1)
			return {
				id: row.id,
				companyId: row.company_id,
				entity: row.entity as CustomFieldEntity,
				key: row.key,
				label: row.label,
				type: row.type as CustomFieldType,
				options: (row.options as string[]) ?? null,
				required: row.required ?? false,
				order: row.order ?? 0,
				active: row.active ?? true,
				createdAt: row.createdAt,
			} as CustomFieldDefinition & { id: string }
		},

		async updateCustomField(companyId, id, data) {
			await db
				.update(customFields)
				.set({
					...(data.label ? { label: data.label as string } : {}),
					...(data.required !== undefined ? { required: data.required as boolean } : {}),
					...(data.active !== undefined ? { active: data.active as boolean } : {}),
					...(data.order !== undefined ? { order: data.order as number } : {}),
					...(data.options !== undefined ? { options: (data.options as string[]) ?? null } : {}),
				})
				.where(and(eq(customFields.company_id, companyId), eq(customFields.id, id)))
		},

		async listEmailTemplates(companyId) {
			const rows = await db
				.select()
				.from(emailTemplates)
				.where(eq(emailTemplates.company_id, companyId))
			return rows.map((row) => ({
				id: row.id,
				companyId: row.company_id,
				kind: row.kind as EmailTemplateKind,
				subject: row.subject,
				body: row.body,
				active: row.active ?? true,
				updatedByUserId: row.updatedByUserId,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			}))
		},

		async upsertEmailTemplate(companyId, kind, data) {
			const id = `${companyId}:${kind}`
			await db
				.insert(emailTemplates)
				.values({
					id,
					company_id: companyId,
					kind,
					subject: data.subject as string,
					body: data.body as string,
					active: (data.active as boolean) ?? true,
					updatedByUserId: (data.updatedByUserId as string) ?? null,
				})
				.onConflictDoUpdate({
					target: emailTemplates.id,
					set: {
						subject: data.subject as string,
						body: data.body as string,
						active: (data.active as boolean) ?? true,
						updatedByUserId: (data.updatedByUserId as string) ?? null,
						updatedAt: new Date(),
					},
				})
			const [row] = await db
				.select()
				.from(emailTemplates)
				.where(eq(emailTemplates.id, id))
				.limit(1)
			return {
				id: row.id,
				companyId: row.company_id,
				kind: row.kind as EmailTemplateKind,
				subject: row.subject,
				body: row.body,
				active: row.active ?? true,
				updatedByUserId: row.updatedByUserId,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			} as EmailTemplate & { id: string }
		},

		async deleteEmailTemplate(companyId, kind) {
			await db.delete(emailTemplates).where(eq(emailTemplates.id, `${companyId}:${kind}`))
		},
	}
}
