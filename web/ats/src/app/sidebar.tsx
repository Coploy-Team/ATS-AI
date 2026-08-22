import { Link, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
	BarChart3,
	Briefcase,
	ChevronsLeft,
	ChevronsRight,
	CreditCard,
	Plug,
	Search,
	ServerCog,
	Settings,
	Users,
	UsersRound,
	type LucideIcon,
	LayoutDashboard,
	ClipboardList,
	Network,
	Mail,
	ChevronDown,
} from 'lucide-react'

import { empresa } from '@coploy/sdk/react'

import { Logo } from '@/components/logo'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'

interface NavItem {
	/** chave i18n (nav.*) */
	label: string
	icon: LucideIcon
	to: string
	params?: Record<string, string>
	/**
	 * Capability que a tela exige. Item que leva a uma tela negada não deve
	 * existir no menu: clicar e bater numa parede é pior do que nunca ver a
	 * porta. Sem `capability`, o item vale para todo membro.
	 */
	capability?: string
	/**
	 * Feature da INSTALAÇÃO que a tela exige (ADR-007). Diferente de
	 * `capability` (o que este usuário pode), isto é o que esta edição TEM:
	 * a distribuição open não tem hunting nem créditos, e sem o plugin do
	 * Motor as telas de entrevista não existem. Menu para tela vazia é porta
	 * pintada na parede.
	 */
	feature?: keyof import('@/lib/capabilities').InstallationFeatures
	/**
	 * Submenu. Existe para que a raiz do menu não vire uma lista de tudo: as
	 * telas que configuram a empresa são um assunto só, e cada uma delas na
	 * raiz obrigava a ler seis rótulos para achar uma.
	 */
	children?: NavItem[]
}

interface NavGroup {
	label: string
	items: NavItem[]
}

/** Estrutura pronta pra crescer nos domínios F6+ sem redesenho (design-fundacao §3.1). */
export const NAV_GROUPS: NavGroup[] = [
	{
		label: 'nav.recruitment',
		items: [
			/*
			 * Pipeline saiu daqui: ele é sempre o pipeline DE uma vaga, e como
			 * item de menu precisava de um seletor que repetia a escolha feita na
			 * lista. Agora é aba dentro da vaga.
			 */
			{ label: 'nav.dashboard', icon: LayoutDashboard, to: '/dashboard' },
			/* antes de Vagas porque é o passo anterior: pedir vem antes de publicar */
			{ label: 'nav.requisitions', icon: ClipboardList, to: '/requisicoes' },
			{ label: 'nav.jobs', icon: Briefcase, to: '/vagas' },
			{ label: 'nav.candidates', icon: Users, to: '/candidatos' },
		],
	},
	{
		label: 'nav.talents',
		/*
		 * "Currículos" saiu. Não era falta de tempo: Hunting é o pool público,
		 * Candidatos é a base da empresa, e o currículo da pessoa já vive no
		 * `web/candidate` e no dossiê. A tela ficaria entre as duas sem trabalho
		 * próprio — e um "em breve" no menu custa mais confiança do que entrega.
		 */
		items: [
			{
				label: 'nav.hunting',
				icon: Search,
				to: '/hunting',
				capability: 'talent:read',
				feature: 'hunting',
			},
		],
	},
	{
		label: 'nav.insights',
		items: [{ label: 'nav.analytics', icon: BarChart3, to: '/analytics' }],
	},
	{
		label: 'nav.company',
		items: [
			{ label: 'nav.team', icon: UsersRound, to: '/time' },
			{ label: 'nav.credits', icon: CreditCard, to: '/creditos', feature: 'billing' },
			/*
			 * Tudo que é "como a empresa opera" fica sob um item só. São telas que
			 * se visita para ajustar algo e não voltar tão cedo — diferente de Time
			 * e Créditos, que se consulta.
			 */
			{
				label: 'nav.setup',
				icon: Settings,
				to: '/configuracoes',
				children: [
					{ label: 'nav.settings', icon: Settings, to: '/configuracoes' },
					{ label: 'nav.emails', icon: Mail, to: '/emails' },
					{ label: 'nav.structure', icon: Network, to: '/estrutura' },
					{ label: 'nav.integrations', icon: Plug, to: '/integracoes', feature: 'integrations' },
					{ label: 'nav.server', icon: ServerCog, to: '/servidor', feature: 'instanceConfig', capability: 'settings:write' },
				],
			},
		],
	},
]

export function Sidebar({
	collapsed,
	onToggleCollapsed,
	mobile = false,
}: {
	collapsed: boolean
	onToggleCollapsed: () => void
	/** true quando renderizado como drawer (< lg): largura fixa, sem colapso. */
	mobile?: boolean
}) {
	const { t } = useTranslation()
	const { can, features } = useCapabilities()
	// saldo vem de /companies/billing/usage (mesma fonte do dashboard); o
	// /billing/info devolvia 0 — daí o número errado. Sem billing na edição
	// (distribuição open) a chamada nem sai.
	const { data: usage } = empresa.useGetCompaniesBillingUsage({
		query: { enabled: features.billing },
	})
	const credits = usage?.data.credits?.creditsTotal

	return (
		<aside
			className={cn(
				'flex h-full shrink-0 flex-col overflow-hidden border-border bg-surface transition-[width] duration-200 lg:rounded-xl lg:border lg:shadow-[0_1px_3px_rgba(15,16,20,0.04)]',
				mobile ? 'w-64 border-r' : collapsed ? 'w-16' : 'w-60',
			)}
		>
			<div
				className={cn(
					'flex h-14 items-center border-b border-border-soft',
					mobile || !collapsed ? 'gap-2.5 px-4' : 'justify-center',
				)}
			>
				{/*
				 * RECOLHIDO, o logo É o botão de expandir.
				 *
				 * O cabeçalho tentava caber a marca (28px) e o botão (28px) numa
				 * barra de 64px: com o `overflow-hidden` da lateral, a marca saía
				 * pela borda e ficava cortada — "chegou mas tá saindo", nas palavras
				 * do testador. Um alvo só resolve a largura e ainda dá um jeito
				 * óbvio de abrir de volta.
				 */}
				{!mobile && collapsed ? (
					<Tooltip side='right' label={t('nav.expand')}>
						<button
							onClick={onToggleCollapsed}
							aria-label={t('nav.expand')}
							className='flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-hover'
						>
							<Logo className='h-6' />
						</button>
					</Tooltip>
				) : (
					<Logo className='h-7' />
				)}
				{(mobile || !collapsed) && (
					<span className='font-display flex-1 text-[15px] font-semibold tracking-tight'>
						Coploy
					</span>
				)}
				{!mobile && !collapsed && (
					<button
						onClick={onToggleCollapsed}
						className='hidden h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-text lg:flex'
						aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
					>
						{collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
					</button>
				)}
			</div>

			<nav className='flex-1 overflow-y-auto py-3'>
				{NAV_GROUPS.map((group) => {
					const items = group.items
						.filter((item) => !item.capability || can(item.capability))
						.filter((item) => !item.feature || features[item.feature])
					// grupo sem itens não deixa rótulo órfão (ex.: Talentos na
					// distribuição open, onde Hunting não existe)
					if (items.length === 0) return null
					return (
						<div key={group.label} className='mb-4'>
							{(mobile || !collapsed) && (
								<div className='px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted'>
									{t(group.label)}
								</div>
							)}
							{items.map((item) =>
								item.children ? (
									<NavBranch
										key={item.label}
										item={item}
										collapsed={collapsed}
										mobile={mobile}
										can={can}
										features={features}
									/>
								) : (
									<NavLeaf
										key={item.label}
										item={item}
										collapsed={collapsed}
										mobile={mobile}
										credits={item.label === 'nav.credits' ? credits : undefined}
									/>
								),
							)}
						</div>
					)
				})}
			</nav>

		</aside>
	)
}

/**
 * Item folha — um destino.
 *
 * Extraído do corpo do `Sidebar` porque o menu passou a ter dois tipos de item,
 * e um `map` com dois ramos inline vira ilegível na terceira condição.
 */
function NavLeaf({
	item,
	collapsed,
	mobile,
	credits,
	nested = false,
}: {
	item: NavItem
	collapsed: boolean
	mobile: boolean
	credits?: number
	nested?: boolean
}) {
	const { t } = useTranslation()
	const expanded = mobile || !collapsed

	const link = (
		<Link
			to={item.to}
			params={item.params}
			className={cn(
				'group relative flex w-full items-center gap-2.5 py-1.5 text-[13px] text-text-2 transition-colors duration-150 hover:bg-hover hover:text-text',
				expanded ? (nested ? 'pl-11 pr-4' : 'px-4') : 'justify-center px-0',
			)}
			activeProps={{ className: 'bg-sel font-medium !text-text' }}
		>
			{({ isActive }) => (
				<>
					<span
						className={cn(
							'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-lime transition-opacity duration-150',
							isActive ? 'opacity-100' : 'opacity-0',
						)}
					/>
					{/* no submenu o ícone sai: a indentação já diz de quem ele depende */}
					{!nested && <item.icon size={15} className={cn(isActive && 'text-lime-fg')} />}
					{expanded && <span className='flex-1 text-left'>{t(item.label)}</span>}
					{expanded && credits !== undefined && (
						<span className={cn('font-num text-[11px]', credits <= 10 ? 'text-amber' : 'text-muted')}>
							{credits}
						</span>
					)}
				</>
			)}
		</Link>
	)

	return collapsed && !mobile ? <Tooltip label={t(item.label)}>{link}</Tooltip> : link
}

/**
 * Item com submenu.
 *
 * Abre sozinho quando você já está numa das telas de dentro — chegar por link
 * direto e encontrar o menu fechado faz a pessoa duvidar de onde está. Colapsado
 * o rail não tem onde expandir, então o pai vira atalho para a primeira tela.
 */
function NavBranch({
	item,
	collapsed,
	mobile,
	can,
	features,
}: {
	item: NavItem
	collapsed: boolean
	mobile: boolean
	can: (capability: string) => boolean
	features: import('@/lib/capabilities').InstallationFeatures
}) {
	const { t } = useTranslation()
	const pathname = useRouterState({ select: (state) => state.location.pathname })
	const children = (item.children ?? [])
		.filter((child) => !child.capability || can(child.capability))
		// mesma regra do topo: superfície que a edição não tem some do menu
		.filter((child) => !child.feature || features[child.feature])
	const hasActiveChild = children.some((child) => pathname.startsWith(child.to))
	const [open, setOpen] = useState(hasActiveChild)

	useEffect(() => {
		if (hasActiveChild) setOpen(true)
	}, [hasActiveChild])

	if (collapsed && !mobile) {
		return <NavLeaf item={children[0] ?? item} collapsed={collapsed} mobile={mobile} />
	}

	return (
		<div>
			<button
				onClick={() => setOpen((current) => !current)}
				aria-expanded={open}
				className={cn(
					'group flex w-full items-center gap-2.5 px-4 py-1.5 text-[13px] transition-colors duration-150 hover:bg-hover hover:text-text',
					hasActiveChild ? 'font-medium text-text' : 'text-text-2',
				)}
			>
				<item.icon size={15} className={cn(hasActiveChild && 'text-lime-fg')} />
				<span className='flex-1 text-left'>{t(item.label)}</span>
				<ChevronDown
					size={13}
					className={cn('transition-transform duration-150', open ? 'rotate-180' : '')}
				/>
			</button>

			{open &&
				children.map((child) => (
					<NavLeaf key={child.label} item={child} collapsed={collapsed} mobile={mobile} nested />
				))}
		</div>
	)
}
