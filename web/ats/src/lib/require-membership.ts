import { empresa } from '@coploy/sdk'

/**
 * O ATS é de quem tem VÍNCULO com uma empresa — `users` (candidato) é outra
 * coisa (achado do teste do plugin, 2026-08-24: a sessão de um candidato
 * entrava e o app renderizava uma casca quebrada, "preso", em vez de dizer
 * que aquela conta não tem acesso).
 *
 * Vereditos:
 * - `ok`: membership resolveu — segue.
 * - `no-access`: o servidor respondeu que esta conta não pertence a empresa
 *   nenhuma → logout + login com aviso. Só 4xx vira isso.
 * - `unknown`: rede/5xx — NUNCA desloga por instabilidade; deixa passar e a
 *   tela degrada como sempre degradou.
 *
 * Memoizado por sessão: uma checagem por boot, não uma por navegação.
 */
let memo: Promise<'ok' | 'no-access' | 'unknown'> | null = null

export function ensureMembership(): Promise<'ok' | 'no-access' | 'unknown'> {
	if (!memo) {
		memo = empresa
			.getCompaniesMembership()
			.then((response) => {
				if (response.status === 200) return 'ok' as const
				const status = response.status as number
				return status >= 400 && status < 500 ? ('no-access' as const) : ('unknown' as const)
			})
			.catch((error) => {
				const status = (error as { status?: number } | null)?.status
				if (typeof status === 'number' && status >= 400 && status < 500) return 'no-access' as const
				return 'unknown' as const
			})
		// veredito transitório não pode ficar gravado — a próxima navegação tenta de novo
		void memo.then((v) => {
			if (v === 'unknown') memo = null
		})
	}
	return memo
}

/** Após logout/login o veredito anterior não vale mais. */
export function resetMembership() {
	memo = null
}
