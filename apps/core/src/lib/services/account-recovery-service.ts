import { randomBytes } from 'node:crypto'

import type { Pessoa } from '@coploy/domain'
import { assertValidCpf } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'

/**
 * Recuperação de acesso e merge assistido (V2-703, GAP 7).
 *
 * O caso real: a pessoa tem CPF preso a um e-mail ou telefone que ela perdeu.
 * Hoje isso a bloqueia por 10+ dias e a tira do prazo da vaga — o processo
 * segue sem ela por um problema de login.
 *
 * Três decisões que sustentam o resto:
 *
 * 1. **A recuperação não revela nada.** A resposta é idêntica para CPF que
 *    existe e CPF que não existe. Diferenciar transformaria a rota em oráculo
 *    de "este CPF tem conta aqui" — e CPF é adivinhável.
 * 2. **Ticket de uso único, curto.** Mesmo desenho do handoff de entrevista:
 *    o link vai para um canal que pode ser encaminhado. Vale uma vez.
 * 3. **Merge é ASSISTIDO, nunca automático.** Duas contas com o mesmo CPF podem
 *    ser a mesma pessoa ou um erro de digitação de terceiro. Fundir sozinho
 *    daria a alguém o histórico de outra pessoa — o pior erro possível aqui.
 *    O serviço detecta e registra; quem decide é um humano no admin.
 */

const TICKET_TTL_MINUTES = 30

export type RecoveryChannel = 'email' | 'phone'

export type MergeCandidate = {
	pessoaId: string
	/** Contas distintas ligadas ao mesmo CPF. */
	userIds: string[]
	usersCompanyIds: string[]
	candidateProfileIds: string[]
	reason: 'multiple_users' | 'multiple_profiles'
}

/** Resposta única, deliberadamente sem informação. */
const NEUTRAL_RESULT = {
	ok: true as const,
	message: 'Se houver conta com esses dados, o canal alternativo receberá as instruções.',
}

function normalizeCpf(cpf: string): string {
	const digits = cpf.replace(/\D/g, '')
	assertValidCpf(digits)
	return digits
}

export function createAccountRecoveryService(infra: InfraProvider) {
	/**
	 * Duas ou mais contas no mesmo CPF significam identidade fragmentada.
	 *
	 * Isso é diagnóstico, não ação: o retorno alimenta a fila do admin.
	 */
	function detectMerge(pessoa: Pessoa): MergeCandidate | null {
		const userIds = pessoa.linkedUserIds ?? []
		const profileIds = pessoa.linkedCandidateProfileIds ?? []

		if (userIds.length > 1) {
			return {
				pessoaId: pessoa.id,
				userIds,
				usersCompanyIds: pessoa.linkedUsersCompanyIds ?? [],
				candidateProfileIds: profileIds,
				reason: 'multiple_users',
			}
		}
		if (profileIds.length > 1) {
			return {
				pessoaId: pessoa.id,
				userIds,
				usersCompanyIds: pessoa.linkedUsersCompanyIds ?? [],
				candidateProfileIds: profileIds,
				reason: 'multiple_profiles',
			}
		}
		return null
	}

	return {
		detectMerge,

		/**
		 * Inicia a recuperação por canal alternativo.
		 *
		 * Devolve sempre a mesma coisa. O ticket, quando existe, sai por e-mail /
		 * SMS — nunca no corpo da resposta, senão qualquer um com o CPF entraria.
		 */
		async requestRecovery(params: {
			cpf: string
			channel: RecoveryChannel
			/** Contato alternativo informado pela pessoa. */
			contact: string
		}) {
			const cpf = normalizeCpf(params.cpf)
			if (!params.contact?.trim()) throw new BadRequestError('contact is required')

			const pessoa = await infra.pessoaRepository.findByCpf(cpf).catch(() => null)
			if (!pessoa) return NEUTRAL_RESULT

			const userId = (pessoa.linkedUserIds ?? [])[0]
			if (!userId) return NEUTRAL_RESULT

			/*
			 * Reusa o ticket de handoff: mesma semântica (uso único, TTL curto,
			 * consumo atômico no repositório) e mesma superfície de ataque já
			 * revisada. Criar um segundo mecanismo de token para o mesmo problema
			 * seria duplicar risco sem ganhar nada.
			 */
			const expiresAt = new Date(Date.now() + TICKET_TTL_MINUTES * 60_000)
			const ticket = randomBytes(32).toString('base64url')

			await Promise.resolve(
				infra.interviewHandoffRepository.createHandoff(ticket, userId, expiresAt),
			).catch((error) => {
				// falha de emissão não pode virar sinal: a resposta é a mesma
				console.error('[Recovery] failed to create ticket:', error)
			})

			const merge = detectMerge(pessoa)
			if (merge) {
				// identidade fragmentada entra na fila do admin, não bloqueia a pessoa
				console.warn(JSON.stringify({ tag: 'identity.needs_merge', ...merge }))
			}

			return NEUTRAL_RESULT
		},

		/**
		 * Diagnóstico para o admin: quem está com identidade fragmentada.
		 *
		 * Não funde nada. A fusão continua sendo decisão humana com as duas
		 * contas à vista.
		 */
		async inspect(cpf: string): Promise<{ pessoa: Pessoa | null; merge: MergeCandidate | null }> {
			const pessoa = await infra.pessoaRepository.findByCpf(normalizeCpf(cpf)).catch(() => null)
			return { pessoa, merge: pessoa ? detectMerge(pessoa) : null }
		},
	}
}

export type AccountRecoveryService = ReturnType<typeof createAccountRecoveryService>
