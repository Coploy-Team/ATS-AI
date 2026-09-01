import type { Pessoa, PessoaLink, PessoaLinkType } from '@coploy/domain'

export type CreatePessoaInput = {
	id?: string
	cpfNormalized: string
	displayName?: string | null
	roles?: Pessoa['roles']
}

export interface PessoaRepository {
	getById(id: string): Promise<Pessoa | null>
	findByCpf(cpfNormalized: string): Promise<Pessoa | null>
	/** Lookup reverso por vínculo (acesso direto: doc id GCP / unique index selfhosted). */
	findByTarget(type: PessoaLinkType, targetId: string): Promise<Pessoa | null>
	create(input: CreatePessoaInput): Promise<Pessoa>
	linkUser(pessoaId: string, userId: string): Promise<Pessoa>
	linkUsersCompany(pessoaId: string, usersCompanyId: string): Promise<Pessoa>
	linkCandidateProfile(pessoaId: string, candidateProfileId: string): Promise<Pessoa>
	listLinks(pessoaId: string): Promise<PessoaLink[]>
}
