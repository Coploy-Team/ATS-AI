import type { Firestore, Transaction } from 'firebase-admin/firestore'
import type { Pessoa, PessoaLink, PessoaLinkType, PessoaRole } from '@coploy/domain'
import type { CreatePessoaInput, PessoaRepository } from '../../../interfaces/repositories/pessoa-repository'

const PESSOAS = 'pessoas'
const PESSOA_LINKS = 'pessoaLinks'

function toIso(value: unknown): string | null {
	if (!value) return null
	if (typeof value === 'string') return value
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'object' && value !== null && 'toDate' in value) {
		const d = (value as { toDate: () => Date }).toDate()
		return d instanceof Date ? d.toISOString() : null
	}
	return null
}

function normalizeArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : []
}

function mapPessoa(id: string, data: Record<string, unknown>): Pessoa {
	return {
		id,
		cpfNormalized: String(data.cpfNormalized ?? id),
		displayName: (data.displayName as string | null) ?? null,
		roles: normalizeArray(data.roles) as PessoaRole[],
		linkedUserIds: normalizeArray(data.linkedUserIds),
		linkedUsersCompanyIds: normalizeArray(data.linkedUsersCompanyIds),
		linkedCandidateProfileIds: normalizeArray(data.linkedCandidateProfileIds),
		mergedIntoPessoaId: (data.mergedIntoPessoaId as string | null) ?? null,
		createdAt: toIso(data.createdAt),
		updatedAt: toIso(data.updatedAt),
	}
}

function mapLink(id: string, data: Record<string, unknown>): PessoaLink {
	return {
		id,
		pessoaId: String(data.pessoaId),
		type: data.type as PessoaLinkType,
		userId: (data.userId as string | null) ?? null,
		usersCompanyId: (data.usersCompanyId as string | null) ?? null,
		candidateProfileId: (data.candidateProfileId as string | null) ?? null,
		createdAt: toIso(data.createdAt),
	}
}

function addUnique(values: string[], value: string): string[] {
	return values.includes(value) ? values : [...values, value]
}

function linkDocId(type: PessoaLinkType, targetId: string): string {
	return `${type}:${targetId}`
}

export function createFirestorePessoaRepository(db: Firestore): PessoaRepository {
	async function loadById(id: string, tx?: Transaction): Promise<Pessoa | null> {
		const ref = db.collection(PESSOAS).doc(id)
		const snap = tx ? await tx.get(ref) : await ref.get()
		return snap.exists ? mapPessoa(snap.id, snap.data()!) : null
	}

	async function link(
		pessoaId: string,
		type: PessoaLinkType,
		targetId: string,
	): Promise<Pessoa> {
		return db.runTransaction(async (tx) => {
			const pessoaRef = db.collection(PESSOAS).doc(pessoaId)
			const pessoaSnap = await tx.get(pessoaRef)
			if (!pessoaSnap.exists) throw new Error('Pessoa not found')
			const pessoa = mapPessoa(pessoaSnap.id, pessoaSnap.data()!)

			const linkRef = db.collection(PESSOA_LINKS).doc(linkDocId(type, targetId))
			const linkSnap = await tx.get(linkRef)
			if (linkSnap.exists) {
				const existing = mapLink(linkSnap.id, linkSnap.data()!)
				if (existing.pessoaId !== pessoaId) {
					throw new Error('Pessoa link already belongs to another pessoa')
				}
			} else {
				tx.set(linkRef, {
					pessoaId,
					type,
					userId: type === 'user' ? targetId : null,
					usersCompanyId: type === 'users_company' ? targetId : null,
					candidateProfileId: type === 'candidate_profile' ? targetId : null,
					targetId,
					createdAt: new Date(),
				})
			}

			const now = new Date()
			const patch =
				type === 'user'
					? { linkedUserIds: addUnique(pessoa.linkedUserIds, targetId), updatedAt: now }
					: type === 'users_company'
						? {
								linkedUsersCompanyIds: addUnique(pessoa.linkedUsersCompanyIds, targetId),
								updatedAt: now,
							}
						: {
								linkedCandidateProfileIds: addUnique(
									pessoa.linkedCandidateProfileIds,
									targetId,
								),
								updatedAt: now,
							}
			tx.update(pessoaRef, patch)

			return {
				...pessoa,
				...patch,
				updatedAt: now.toISOString(),
			}
		})
	}

	return {
		getById(id) {
			return loadById(id)
		},

		async findByCpf(cpfNormalized) {
			return loadById(cpfNormalized)
		},

		async findByTarget(type, targetId) {
			const linkSnap = await db.collection(PESSOA_LINKS).doc(linkDocId(type, targetId)).get()
			if (!linkSnap.exists) return null
			const link = mapLink(linkSnap.id, linkSnap.data()!)
			return loadById(link.pessoaId)
		},

		async create(input: CreatePessoaInput) {
			const id = input.id ?? input.cpfNormalized
			const ref = db.collection(PESSOAS).doc(id)
			const now = new Date()
			const payload = {
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
				await ref.create(payload)
				return mapPessoa(id, payload)
			} catch (err) {
				const existing = await loadById(id)
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
			const snap = await db
				.collection(PESSOA_LINKS)
				.where('pessoaId', '==', pessoaId)
				.get()
			return snap.docs.map((d) => mapLink(d.id, d.data()))
		},
	}
}
