import { Outlet, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Logo } from '@/components/logo'
import { getAuth } from '@/lib/auth'
import { esquecerPapel } from '@/lib/guest'
import { ThemeToggle } from '@/components/theme-toggle'
import { Tooltip } from '@/ui/tooltip'

/**
 * Casa do convidado de revisão — FORA do shell do ATS.
 *
 * Antes eu tinha posto a tela dentro do shell e escondido menu, busca e barra
 * quando o papel era `shared`. Errado por dois motivos: as capabilities chegam
 * por uma chamada, então o app pintava o menu inteiro e o apagava meio segundo
 * depois (o pisca), e "esconder peça a peça" é frágil — qualquer item novo no
 * shell nasce visível para quem não devia ver.
 *
 * Aqui não há o que esconder: a barra tem a marca, o tema e a saída. Nada que
 * leve para dentro do produto.
 */
export function GuestLayout() {
	const { t } = useTranslation()
	const navigate = useNavigate()

	/*
	 * Sair tem que SAIR.
	 *
	 * Eu só chamava `logout()` e não navegava: a sessão morria mas a rota
	 * continuava montada, e a tela ficava travada onde estava. Além disso o papel
	 * precisa ser esquecido, senão o próximo login nesta máquina herda o desvio.
	 */
	async function sair() {
		esquecerPapel()
		await getAuth().logout()
		await navigate({ to: '/login' })
	}

	return (
		<div className='flex min-h-screen flex-col bg-bg'>
			<header className='flex h-14 shrink-0 items-center gap-3 border-b border-border-soft px-6'>
				<Logo className='h-7' />
				<span className='font-display flex-1 text-[15px] font-semibold tracking-tight'>Coploy</span>
				<ThemeToggle />
				<Tooltip side='bottom' label={t('topbar.logout')}>
					<button
						onClick={() => void sair()}
						aria-label={t('topbar.logout')}
						className='flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text'
					>
						<LogOut size={15} />
					</button>
				</Tooltip>
			</header>

			<main className='min-h-0 flex-1'>
				<Outlet />
			</main>
		</div>
	)
}
