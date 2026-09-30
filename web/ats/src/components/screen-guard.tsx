import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ACESSO_POR_TELA } from '@/app/screen-access'
import { useCapabilities, type InstallationFeatures } from '@/lib/capabilities'

/**
 * Tela para quem chegou onde o papel (ou a edição) não alcança.
 *
 * Num botão, sumir basta. Numa TELA inteira, sumir confunde: a pessoa clicou
 * num link, num favorito ou num "Ver vaga" de uma lista, e precisa entender o
 * que houve — em vez de receber a tela vazia com o erro cru da API, que foi o
 * que aconteceu em Créditos, E-mails e Requisições.
 */
export function SemAcesso({ motivo }: { motivo: 'papel' | 'edicao' }) {
	const { t } = useTranslation()
	return (
		<div className='flex min-h-[60vh] flex-col items-center justify-center px-6 text-center'>
			<p className='font-display text-[15px] font-semibold'>{t('noAccess.title')}</p>
			<p className='mt-1 max-w-sm text-[12.5px] leading-relaxed text-text-2'>
				{t(motivo === 'edicao' ? 'noAccess.bodyEdition' : 'noAccess.body')}
			</p>
		</div>
	)
}

/**
 * Guarda de tela, lendo a tabela única.
 *
 * `path` é a chave em `ACESSO_POR_TELA`; tela sem entrada lá passa direto (é o
 * caso das telas que qualquer membro alcança).
 */
export function ScreenGuard({ path, children }: { path: string; children: ReactNode }) {
	const { can, features, isLoading } = useCapabilities()
	const regra = ACESSO_POR_TELA[path]
	if (!regra) return <>{children}</>

	/*
	 * Enquanto carrega, deixa passar: esconder por meio segundo e trazer de
	 * volta pisca a tela. O servidor continua sendo quem decide de verdade.
	 */
	if (regra.feature && !isLoading && !features[regra.feature as keyof InstallationFeatures]) {
		return <SemAcesso motivo='edicao' />
	}
	if (regra.capability && !can(regra.capability)) {
		return <SemAcesso motivo='papel' />
	}
	return <>{children}</>
}
