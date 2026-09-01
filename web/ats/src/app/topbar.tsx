import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut, Menu, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { CompanyBadge } from '@/components/company-badge'
import { NotificationsMenu } from '@/components/notifications-menu'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { getAuth } from '@/lib/auth'
import { limparSessao } from '@/lib/session-reset'
import { Kbd } from '@/ui/kbd'
import { Tooltip } from '@/ui/tooltip'

export function Topbar({
	onOpenMenu,
	onOpenSearch,
}: {
	onOpenMenu: () => void
	onOpenSearch: () => void
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	/*
	 * A identidade vem de `/profile`, não do token do Firebase.
	 *
	 * O token guarda o `displayName` de quando a sessão foi criada: editar o
	 * nome no perfil não o altera, então a topbar seguia mostrando as iniciais
	 * antigas ("HH") ao lado de um perfil que já dizia outro nome. Duas fontes
	 * para a mesma pessoa sempre divergem — esta é a que a pessoa edita.
	 */
	const session = getAuth().getCurrentUser()
	const { data: profileData } = empresa.useGetProfile()
	const profile = (profileData?.data as { user?: { name?: string | null; email?: string; avatarUrl?: string | null } } | undefined)?.user
	const displayName = profile?.name || session?.displayName || ''
	const email = profile?.email || session?.email || ''
	const avatarUrl = profile?.avatarUrl || ''
	// O que aparece à esquerda é a EMPRESA da sessão (feedback do produto:
	// aqui aparecia o displayName do usuário). O usuário fica no avatar.
	const { data: companyData } = empresa.useGetCompanies()
	const company = companyData?.data.company
	/*
	 * Iniciais de NOME e SOBRENOME. Antes eram as duas primeiras partes, e
	 * "Henrique Olinda Cabral Amorim" virava "HO" — ninguém se reconhece nisso.
	 */
	const parts = displayName.trim().split(/\s+/).filter(Boolean)
	const initials =
		(parts.length > 1
			? `${parts[0][0]}${parts[parts.length - 1][0]}`
			: (parts[0] ?? email).slice(0, 2)
		).toUpperCase() || '?'

	async function handleLogout() {
		// apaga o papel, as features lembradas E o cache de dados ANTES de sair:
		// sobra de sessão mostrava o usuário anterior até alguém dar refresh
		limparSessao()
		await getAuth().logout()
		await navigate({ to: '/login' })
	}

	return (
		<header className='flex h-14 shrink-0 items-center gap-2 border-b border-border-soft px-3 sm:gap-3 sm:px-4'>
			<button
				onClick={onOpenMenu}
				aria-label={t('nav.expand')}
				className='flex h-8 w-8 items-center justify-center rounded-lg text-text-2 transition-colors duration-150 hover:bg-hover hover:text-text lg:hidden'
			>
				<Menu size={16} />
			</button>
			<CompanyBadge name={company?.companyName} logoUrl={company?.companLogo} />

			<div className='flex flex-1 justify-center'>
				<button
					onClick={onOpenSearch}
					className='hidden h-8 w-full max-w-xl items-center gap-2 rounded-lg border border-border bg-bg px-3 text-[13px] text-muted transition-colors duration-150 hover:border-muted sm:flex'>
					<Search size={13} />
					<span className='flex-1 text-left'>{t('topbar.searchPlaceholder')}</span>
					<Kbd>⌘K</Kbd>
				</button>
			</div>

			<div className='flex items-center gap-1'>
				<span className='hidden sm:block'>
					<LanguageSwitcher />
				</span>
				<ThemeToggle />
				{company?.id && <NotificationsMenu companyId={company.id} />}
				{/*
				 * As iniciais sozinhas não dizem de QUEM é a sessão — "HH" não é
				 * resposta pra "com que conta eu estou?", e a pergunta aparece toda vez
				 * que alguém usa duas contas ou senta na máquina de outra pessoa. O
				 * tooltip passa a nomear a conta.
				 */}
				<Tooltip
					side='bottom'
					label={displayName || email || t('topbar.profile')}
				>
					<Link
						to='/perfil'
						aria-label={t('topbar.profile')}
						className='ml-1 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-lime-soft text-[11px] font-semibold text-lime-fg transition-[filter] hover:brightness-95'
					>
						{avatarUrl ? (
							<img src={avatarUrl} alt='' className='h-full w-full object-cover' />
						) : (
							initials
						)}
					</Link>
				</Tooltip>
				<Tooltip side='bottom' label={t('topbar.logout')}>
					<button
						onClick={handleLogout}
						className='flex h-8 w-8 items-center justify-center rounded-lg text-text-2 transition-colors duration-150 hover:bg-hover hover:text-text'
						aria-label={t('topbar.logout')}
					>
						<LogOut size={15} />
					</button>
				</Tooltip>
			</div>
		</header>
	)
}
