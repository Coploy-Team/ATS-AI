import { and, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { Pessoa, PessoaLink, PessoaLinkType, PessoaRole } from '@coploy/domain'
import type { CreatePessoaInput, PessoaRepository } from '../../../interfaces/repositories/pessoa-repository'
import type { DrizzleDb } from '../db/client'
import { schema } from './helpers'

function toIso(value: Date | string | null | undefined): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	return value.toISOString()
}

function normalizeArray(value: string[] | null | undefined): string[] {
	return Array.isArray(value) ? value.filter(Boolean) : []
}

function mapPessoa(row: typeof schema.pessoas.$inferSelect): Pessoa {
	return {
		id: row.id,
		cpfNormalized: row.cpfNormalized,
		displayName: row.displayName ?? null,
		roles: normalizeArray(row.roles) as PessoaRole[],
		linkedUserIds: normalizeArray(row.linkedUserIds),
		linkedUsersCompanyIds: normalizeArray(row.linkedUsersCompanyIds),
		linkedCandidateProfileIds: normalizeArray(row.linkedCandidateProfileIds),
		mergedIntoPessoaId: row.mergedIntoPessoaId ?? null,
		createdAt: toIso(row.createdAt),
		updatedAt: toIso(row.updatedAt),
	}
}

function mapLink(row: typeof schema.pessoaLinks.$inferSelect): PessoaLink {
	return {
		id: row.id,
		pessoaId: row.pessoaId,
		type: row.type as PessoaLinkType,
		userId: row.userId ?? null,
		usersCompanyId: row.usersCompanyId ?? null,
		candidateProfileId: row.candidateProfileId ?? null,
		createdAt: toIso(row.createdAt),
	}
}

function addUnique(values: string[], value: string): string[] {
	return values.includes(value) ? values : [...values, value]
}

export function createDrizzlePessoaRepository(db: DrizzleDb): PessoaRepository {
	async function loadById(id: string): Promise<Pessoa | null> {
		const rows = await db
			.select()
			.from(schema.pessoas)
			.where(eq(schema.pessoas.id, id))
			.limit(1)
		return rows[0] ? mapPessoa(rows[0]) : null
	}

	async function link(
		pessoaId: string,
		type: PessoaLinkType,
		targetId: string,
	): Promise<Pessoa> {
		const current = await loadById(pessoaId)
		if (!current) throw new Error('Pessoa not found')

		const existing = await db
			.select()
			.from(schema.pessoaLinks)
			.where(
				and(
					eq(schema.pessoaLinks.type, type),
					eq(schema.pessoaLinks.targetId, targetId),
				),
			)
			.limit(1)

		if (existing[0] && existing[0].pessoaId !== pessoaId) {
			throw new Error('Pessoa link already belongs to another pessoa')
		}

		const now = new Date()
		if (!existing[0]) {
			await db.insert(schema.pessoaLinks).values({
				id: randomUUID(),
				pessoaId,
				type,
				userId: type === 'user' ? targetId : null,
				usersCompanyId: type === 'users_company' ? targetId : null,
				candidateProfileId: type === 'candidate_profile' ? targetId : null,
				targetId,
				createdAt: now,
			})
		}

		const patch =
			type === 'user'
				? { linkedUserIds: addUnique(current.linkedUserIds, targetId), updatedAt: now }
				: type === 'users_company'
					? {
							linkedUsersCompanyIds: addUnique(current.linkedUsersCompanyIds, targetId),
							updatedAt: now,
						}
					: {
							linkedCandidateProfileIds: addUnique(
								current.linkedCandidateProfileIds,
								targetId,
							),
							updatedAt: now,
						}

		await db.update(schema.pessoas).set(patch).where(eq(schema.pessoas.id, pessoaId))

		const updated = await loadById(pessoaId)
		if (!updated) throw new Error('Pessoa not found after link')
		return updated
	}

	return {
		getById: loadById,

		async findByCpf(cpfNormalized) {
			const rows = await db
				.select()
				.from(schema.pessoas)
				.where(eq(schema.pessoas.cpfNormalized, cpfNormalized))
				.limit(1)
			return rows[0] ? mapPessoa(rows[0]) : null
		},

		async findByTarget(type, targetId) {
			const rows = await db
				.select()
				.from(schema.pessoaLinks)
				.where(
					and(
						eq(schema.pessoaLinks.type, type),
						eq(schema.pessoaLinks.targetId, targetId),
					),
				)
				.limit(1)
			if (!rows[0]) return null
			return loadById(rows[0].pessoaId)
		},

		async create(input: CreatePessoaInput) {
			const id = input.id ?? randomUUID()
			const now = new Date()
			const row = {
				id,
				cpfNormalized: input.cpfNormalized,
				displayName: input.displayName ?? null,
				roles: normalizeArray(input.roles ?? []),
				linkedUserIds: [],
				linkedUsersCompanyIds: [],
				linkedCandidateProfileIds: [],
				mergedIntoPessoaId: null,
				createdAt: now,
				updatedAt: now,
			}
			try {
				await db.insert(schema.pessoas).values(row)
				return mapPessoa(row)
			} catch (err) {
				const existing = await this.findByCpf(input.cpfNormalized)
				if (existing) return existing
				const message = err instanceof Error ? err.message : String(err)
				throw new Error(`Failed to create pessoa: ${message}`)
			}
		},

		linkUser(pessoaId, userId) {
			return link(pessoaId, 'user', userId)
		},

		linkUsersCompany(pessoaId, usersCompanyId) {
			return link(pessoaId, 'users_company', usersCompanyId)
		},

		linkCandidateProfile(pessoaId, candidateProfileId) {
			return link(pessoaId, 'candidate_profile', candidateProfileId)
		},

		async listLinks(pessoaId) {
			const rows = await db
				.select()
				.from(schema.pessoaLinks)
				.where(eq(schema.pessoaLinks.pessoaId, pessoaId))
				.orderBy(sql`${schema.pessoaLinks.createdAt} ASC`)
			return rows.map(mapLink)
		},
	}
}
