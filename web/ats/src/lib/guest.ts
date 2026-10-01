import { empresa } from '@coploy/sdk'

import { getAuth } from '@/lib/auth'

import { useCapabilities } from '@/lib/capabilities'

/**
 * O convidado de revisão — quem entrou por um link de compartilhamento.
 *
 * O papel `shared` existe no core e a v1 depende das capabilities que ele tem
 * hoje (`job:read`, `candidate:read`, `analytics:read`...). Mexer na tabela
 * quebraria a v1, que não pode ser tocada.
 *
 * Então a trava é da SUPERFÍCIE v2: o ATS não oferece nada além do que foi
 * compartilhado. É restrição de navegação, não de permissão — o convidado
 * continua com o mesmo acesso de API que tem na v1, nem mais nem menos. Fechar
 * de verdade exige uma capability própria para as rotas de compartilhamento, e
 * isso muda a v1.
 */
const CHAVE = 'coploy.ats.role'

/**
 * O papel LEMBRADO, para decidir antes de renderizar — SEMPRE amarrado ao uid.
 *
 * As capabilities vêm de uma chamada; até ela responder, o app já pintou o
 * shell inteiro. Com o papel em mãos desde o boot, o roteador decide antes de
 * montar qualquer coisa.
 *
 * ⚠️ Eu tinha guardado só o papel, sem dono. Um convidado deixava `shared` no
 * navegador, e o dono da empresa entrando DEPOIS na mesma máquina era mandado
 * para a área de compartilhamento — a memória de uma sessão contaminava a
 * seguinte. Agora o valor só vale para o uid que o gravou; de qualquer outro,
 * é como se não existisse.
 */
export function papelLembrado(): string | null {
	try {
		const bruto = localStorage.getItem(CHAVE)
		if (!bruto) return null
		const { uid, role } = JSON.parse(bruto) as { uid?: string; role?: string }
		return uid && uid === getAuth().getCurrentUser()?.uid ? (role ?? null) : null
	} catch {
		return null
	}
}

export function lembrarPapel(role: string) {
	try {
		const uid = getAuth().getCurrentUser()?.uid
		if (!uid) return
		localStorage.setItem(CHAVE, JSON.stringify({ uid, role }))
	} catch {
		// navegação privada: sem memória, cai no caminho lento — não é erro
	}
}

/** Sair apaga o papel: nada de sobra de sessão para a próxima pessoa. */
export function esquecerPapel() {
	try {
		localStorage.removeItem(CHAVE)
	} catch {
		// idem
	}
}

export function ehConvidado(role: string | null | undefined) {
	return role === 'shared'
}

export function useIsGuest() {
	const { role, isLoading } = useCapabilities()
	return { isGuest: ehConvidado(isLoading ? papelLembrado() : role), isLoading }
}

/** Onde o convidado vive. Qualquer outra rota do app o traz de volta para cá. */
export const GUEST_HOME = '/compartilhado' as const

/**
 * O papel, garantido — buscando se ainda não souber.
 *
 * O `beforeLoad` do roteador precisa decidir ANTES de montar. Com só o valor
 * lembrado, o primeiro acesso de um convidado passava direto: `localStorage`
 * vazio, nenhuma trava, e ele caía no ATS inteiro. Testado e reproduzido — em
 * navegador novo, `/vagas` abria com menu e tudo.
 *
 * Então na primeira vez esperamos a resposta. É UMA chamada, só quando não há
 * papel guardado; nas seguintes o valor já está em mãos e a decisão é síncrona.
 * Falha de rede devolve `null` e libera: recusar acesso por causa de uma
 * chamada que caiu seria pior que o risco que ela cobre.
 */
export async function papelGarantido(): Promise<string | null> {
	const lembrado = papelLembrado()
	if (lembrado) return lembrado
	try {
		const resposta = await empresa.getCompaniesCapabilities()
		const role = (resposta.data as { role?: string } | undefined)?.role ?? null
		if (role) lembrarPapel(role)
		return role
	} catch {
		return null
	}
}
