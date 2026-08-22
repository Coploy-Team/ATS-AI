import { BadRequestError } from '@coploy/shared/errors'
import type { InfraProvider } from '@coploy/infra'
import type { Pessoa } from '@coploy/domain'
import { assertValidCpf } from '@coploy/domain'

export type PessoaLinkInput = {
	userId?: string | null
	usersCompanyId?: string | null
	candidateProfileId?: string | null
}

export type PessoaUpsertByCpfParams = PessoaLinkInput & {
	cpf: string
	displayName?: string | null
}

export type PessoaIdentityResult = {
	pessoa: Pessoa
	needsMerge: boolean
	reason?: 'user_conflict' | 'users_company_conflict' | 'candidate_profile_conflict'
}

/**
 * Identity service Talent OS (F0.2) — camada nova ao lado de User/CandidateProfile.
 * TODO(dev): implementar merge assistido entre pessoas na task futura de pessoa_merged.
 */
export function createPessoaService(infra: InfraProvider) {
	const repo = infra.pessoaRepository

	async function resolveOrCreatePessoa(params: {
		cpf: string
		displayName?: string | null
	}): Promise<Pessoa> {
		const cpfNormalized = normalizeCpfOrThrow(params.cpf)
		const existing = await repo.findByCpf(cpfNormalized)
		if (existing) return existing
		return repo.create({
			id: cpfNormalized,
			cpfNormalized,
			displayName: params.displayName,
		})
	}

	async function linkPessoa(pessoa: Pessoa, input: PessoaLinkInput): Promise<PessoaIdentityResult> {
		if (input.userId && hasDifferentLink(pessoa.linkedUserIds, input.userId)) {
			return { pessoa, needsMerge: true, reason: 'user_conflict' }
		}
		if (
			input.usersCompanyId &&
			hasDifferentLink(pessoa.linkedUsersCompanyIds, input.usersCompanyId)
		) {
			return { pessoa, needsMerge: true, reason: 'users_company_conflict' }
		}
		if (
			input.candidateProfileId &&
			hasDifferentLink(pessoa.linkedCandidateProfileIds, input.candidateProfileId)
		) {
			return { pessoa, needsMerge: true, reason: 'candidate_profile_conflict' }
		}

		let updated = pessoa
		if (input.userId && !updated.linkedUserIds.includes(input.userId)) {
			updated = await repo.linkUser(updated.id, input.userId)
		}
		if (
			input.usersCompanyId &&
			!updated.linkedUsersCompanyIds.includes(input.usersCompanyId)
		) {
			updated = await repo.linkUsersCompany(updated.id, input.usersCompanyId)
		}
		if (
			input.candidateProfileId &&
			!updated.linkedCandidateProfileIds.includes(input.candidateProfileId)
		) {
			updated = await repo.linkCandidateProfile(updated.id, input.candidateProfileId)
		}

		return { pessoa: updated, needsMerge: false }
	}

	const upsertByCpf = async (
		params: PessoaUpsertByCpfParams,
	): Promise<PessoaIdentityResult> => {
			if (!params.cpf) throw new BadRequestError('cpf is required')
			try {
				const pessoa = await resolveOrCreatePessoa(params)
				return await linkPessoa(pessoa, params)
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				throw new BadRequestError(message)
			}
		}

	return {
		upsertByCpf,

		/**
		 * Resolve CPF do próprio usuário via pessoaLinks (fonte única em `pessoas`).
		 * Sem vínculo ou falha de lookup → null. Nunca lança.
		 */
		async getCpfByUserId(userId: string): Promise<string | null> {
			try {
				const pessoa = await repo.findByTarget('user', userId)
				return pessoa?.cpfNormalized ?? null
			} catch {
				return null
			}
		},

		async linkUserByCpf(params: { cpf: string; userId: string; displayName?: string | null }) {
			return upsertByCpf({
				cpf: params.cpf,
				userId: params.userId,
				displayName: params.displayName,
			})
		},

		async linkUsersCompanyByCpf(params: {
			cpf: string
			usersCompanyId: string
			displayName?: string | null
		}) {
			return upsertByCpf({
				cpf: params.cpf,
				usersCompanyId: params.usersCompanyId,
				displayName: params.displayName,
			})
		},

		async linkCandidateProfileByCpf(params: {
			cpf: string
			candidateProfileId: string
			displayName?: string | null
		}) {
			return upsertByCpf({
				cpf: params.cpf,
				candidateProfileId: params.candidateProfileId,
				displayName: params.displayName,
			})
		},
	}
}

function normalizeCpfOrThrow(cpf: string): string {
	try {
		return assertValidCpf(cpf)
	} catch {
		throw new BadRequestError('CPF inválido')
	}
}

function hasDifferentLink(links: string[], nextId: string): boolean {
	return links.length > 0 && !links.includes(nextId)
}
