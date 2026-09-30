import { and, eq } from 'drizzle-orm'

import type { JobTemplate, JobTemplateContent } from '@coploy/domain'

import type { JobTemplateRepository } from '../../../interfaces/repositories/job-template-repository'
import type { DrizzleDb } from '../db/client'
import { jobTemplates } from '../db/schema/tables'

type Linha = typeof jobTemplates.$inferSelect

/**
 * O conteúdo é jsonb, então ele volta inteiro — nenhum campo some por não estar
 * listado num mapeador. É o oposto do resto desta base, e de propósito: o
 * conteúdo da vaga muda toda semana.
 */
function mapear(row: Linha): JobTemplate {
	const content = (row.content ?? {}) as JobTemplateContent
	return {
		...content,
		id: row.id,
		companyId: row.company_id,
		name: row.name,
		jobName: row.jobName,
		description: row.description,
		active: row.active ?? true,
		createdByUserId: row.createdByUserId,
		createdByName: row.createdByName,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		lastUsedAt: row.lastUsedAt,
	}
}

/** Separa o que é coluna do que vai para o jsonb. */
function partir(data: Record<string, unknown>): {
	colunas: Record<string, unknown>
	content: Record<string, unknown>
} {
	const DE_COLUNA = new Set([
		'name',
		'jobName',
		'description',
		'active',
		'createdByUserId',
		'createdByName',
		'lastUsedAt',
	])
	const colunas: Record<string, unknown> = {}
	const content: Record<string, unknown> = {}
	for (const [chave, valor] of Object.entries(data)) {
		if (valor === undefined) continue
		if (chave === 'id' || chave === 'companyId') continue
		if (chave === 'createdAt' || chave === 'updatedAt') continue
		if (DE_COLUNA.has(chave)) colunas[chave] = valor
		else content[chave] = valor
	}
	return { colunas, content }
}

export function createSelfHostedJobTemplateRepository(
	db: DrizzleDb,
): JobTemplateRepository {
	return {
		async listJobTemplates(companyId) {
			const rows = await db
				.select()
				.from(jobTemplates)
				.where(eq(jobTemplates.company_id, companyId))
			return rows.map(mapear)
		},

		async getJobTemplate(companyId, id) {
			const rows = await db
				.select()
				.from(jobTemplates)
				.where(and(eq(jobTemplates.company_id, companyId), eq(jobTemplates.id, id)))
				.limit(1)
			return rows[0] ? mapear(rows[0]) : null
		},

		async createJobTemplate(companyId, data) {
			const id = crypto.randomUUID()
			const { colunas, content } = partir(data as Record<string, unknown>)
			await db.insert(jobTemplates).values({
				id,
				company_id: companyId,
				name: (colunas.name as string) ?? 'Sem nome',
				jobName: (colunas.jobName as string) ?? null,
				description: (colunas.description as string) ?? null,
				content,
				active: (colunas.active as boolean) ?? true,
				createdByUserId: (colunas.createdByUserId as string) ?? null,
				createdByName: (colunas.createdByName as string) ?? null,
			})
			const criado = await this.getJobTemplate(companyId, id)
			return { ...(criado as JobTemplate), id }
		},

		async updateJobTemplate(companyId, id, data) {
			const atual = await this.getJobTemplate(companyId, id)
			if (!atual) return
			const { colunas, content } = partir(data as Record<string, unknown>)
			/*
			 * O jsonb é substituído pelo MERGE com o que já existe: um PATCH que
			 * mande só a descrição não pode apagar as etapas e as perguntas.
			 */
			const anterior = partir(atual as unknown as Record<string, unknown>).content
			await db
				.update(jobTemplates)
				.set({
					...colunas,
					content: { ...anterior, ...content },
					updatedAt: new Date(),
				})
				.where(and(eq(jobTemplates.company_id, companyId), eq(jobTemplates.id, id)))
		},
	}
}
