import { useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { NAV_GROUPS } from '@/app/sidebar'

/**
 * O eyebrow de toda tela: "Recrutamento · Vagas", em mono e lime, acima do
 * título. É a assinatura que o Diego reconheceu no protótipo — separa e
 * explica onde a pessoa está sem gastar uma frase. Derivado do menu (o mesmo
 * mapa que acende o item), então tela nova ganha o seu sem declarar nada;
 * quem tem contexto melhor (a vaga, a edição) passa o próprio.
 */
export function useEyebrow(): string {
	const { t } = useTranslation()
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	let best: { group: string; item: string; len: number } | null = null
	for (const group of NAV_GROUPS) {
		for (const item of group.items) {
			const candidates = [item, ...(item.children ?? [])]
			for (const leaf of candidates) {
				const to = leaf.to.replace(/\/\$[^/]+/g, '')
				if (pathname === to || pathname.startsWith(to + '/')) {
					if (!best || to.length > best.len) best = { group: group.label, item: leaf.label, len: to.length }
				}
			}
		}
	}
	if (!best) return 'ATS'
	return `${t(best.group)} · ${t(best.item)}`
}

/**
 * Dentro de uma vaga o cabeçalho da vaga já carrega o eyebrow; a aba
 * (Visão geral, Pipeline…) não repete — dois "Recrutamento · Vagas" na mesma
 * tela é ruído, não charme.
 */
export function useInsideJob(): boolean {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	return /^\/vagas\/(?!nova$)[^/]+\//.test(pathname)
}
