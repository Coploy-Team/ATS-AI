/**
 * Talent OS Identity (F0.2) — pessoa/CPF global.
 *
 * CPF deve ser sempre persistido em `cpfNormalized`: 11 dígitos, sem máscara.
 * Não logar CPF em claro; use `maskCpf()` quando precisar exibir em erro/audit.
 */

export type PessoaRole = 'candidato' | 'colaborador' | 'usuario_empresa'

export type PessoaLinkType = 'user' | 'users_company' | 'candidate_profile'

export interface Pessoa {
	id: string
	cpfNormalized: string
	displayName?: string | null
	roles?: PessoaRole[] | null
	linkedUserIds: string[]
	linkedUsersCompanyIds: string[]
	linkedCandidateProfileIds: string[]
	/** TODO(dev): merge assistido/pessoa_merged entra em task futura. */
	mergedIntoPessoaId?: string | null
	createdAt?: string | null
	updatedAt?: string | null
}

export interface PessoaLink {
	id: string
	pessoaId: string
	type: PessoaLinkType
	userId?: string | null
	usersCompanyId?: string | null
	candidateProfileId?: string | null
	createdAt?: string | null
}

export function normalizeCpf(cpf: string): string {
	return cpf.replace(/\D/g, '')
}

export function isValidCpf(cpf: string): boolean {
	const digits = normalizeCpf(cpf)
	if (digits.length !== 11) return false
	if (/^(\d)\1{10}$/.test(digits)) return false

	const calcDigit = (size: number) => {
		let sum = 0
		for (let i = 0; i < size; i += 1) {
			sum += Number(digits[i]) * (size + 1 - i)
		}
		const mod = (sum * 10) % 11
		return mod === 10 ? 0 : mod
	}

	return calcDigit(9) === Number(digits[9]) && calcDigit(10) === Number(digits[10])
}

export function assertValidCpf(cpf: string): string {
	const normalized = normalizeCpf(cpf)
	if (!isValidCpf(normalized)) {
		throw new Error('CPF inválido')
	}
	return normalized
}

export function maskCpf(cpf: string): string {
	const normalized = normalizeCpf(cpf)
	if (normalized.length !== 11) return '***'
	return `${normalized.slice(0, 3)}.***.***-${normalized.slice(9)}`
}
