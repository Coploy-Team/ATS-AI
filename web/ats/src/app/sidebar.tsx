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
	Users,
	UsersRound,
	type LucideIcon,
	LayoutDashboard,
	ClipboardList,
	Network,
	Mail,
	ChevronDown,
	Building2,
	Globe,
	LayoutTemplate,
	FileText,
	FileSpreadsheet,
	MessagesSquare,
	Workflow,
} from 'lucide-react'

import { useBillingUsage } from '@/features/saas'

import { Logo } from '@/components/logo'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'
import { ACESSO_POR_TELA } from '@/app/screen-access'

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
	 * Flag da EMPRESA (não da instalação).
	 *
	 * Terceiro eixo: `capability` é o que a pessoa pode, `feature` é o que esta
	 * edição tem, `flag` é o que esta empresa ligou. Funcionalidade opcional que
	 * a empresa não usa não ocupa lugar no menu.
	 */
	flag?: string
	/**
	 * Feature da INSTALAÇÃO que a tela exige . Diferente de
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
			/*
			 * "Pedido de vaga", não "Requisição".
			 *
			 * Requisição é vocabulário de RH de empresa grande — numa empresa de
			 * trinta pessoas ninguém usa a palavra, e ela ocupava o segundo lugar
			 * do menu sem que se soubesse para quê. E o item só aparece para quem
			 * LIGOU a aprovação: exigir pedido é opt-in por empresa, então mostrar
			 * a tela para quem nunca vai aprovar nada é porta pintada.
			 */
			{
				label: 'nav.requisitions',
				icon: ClipboardList,
				to: '/pedidos-de-vaga',
				flag: 'jobRequisition',
			},
			{ label: 'nav.jobs', icon: Briefcase, to: '/vagas' },
			{ label: 'nav.candidates', icon: Users, to: '/candidatos' },
			/*
			 * Entrevistas depois de Candidatos: pessoa vem antes do evento. Quem
			 * abre esta tela quer ler o período ("o que aconteceu esta semana"),
			 * não achar alguém — para achar alguém existe Candidatos e o ⌘K.
			 */
			{ label: 'nav.interviews', icon: MessagesSquare, to: '/entrevistas' },
		],
	},
	{
		/*
		 * Modelos ganhou grupo próprio.
		 *
		 * Ele não é "recrutar" (não se abre no dia a dia de uma vaga) nem
		 * "configurar a empresa" (quem usa é quem cria vaga). É o coração do
		 * reaproveitamento, e enterrá-lo em Configuração repetiria o erro que esta
		 * reorganização veio corrigir: coisa importante onde ninguém procura.
		 *
		 * Os quatro itens são RECORTES do mesmo `JobTemplate` — o modelo carrega
		 * descrição, etapas e perguntas juntos, e cada entrada mostra a lista pelo
		 * ângulo de quem veio procurar aquilo. Não são quatro tipos de registro.
		 */
		label: 'nav.library',
		items: [
			{ label: 'nav.templates', icon: LayoutTemplate, to: '/modelos', capability: 'job:write' },
			{
				label: 'nav.templateDescriptions',
				icon: FileText,
				to: '/modelos/descricoes',
				capability: 'job:write',
			},
			{
				label: 'nav.templateProcesses',
				icon: Workflow,
				to: '/modelos/processos',
				capability: 'job:write',
			},
			/* Roteiro é o que o Motor conduz: sem plugin, não há o que roteirizar. */
			{
				label: 'nav.templateScripts',
				icon: MessagesSquare,
				to: '/modelos/roteiros',
				capability: 'job:write',
				feature: 'motor',
			},
		],
	},
	{
		label: 'nav.insights',
		items: [
			{ label: 'nav.analytics', icon: BarChart3, to: '/analytics' },
			{
				label: 'nav.reports',
				icon: FileSpreadsheet,
				to: '/relatorios',
				capability: 'analytics:read',
			},
		],
	},
	{
		/*
		 * Configuração subiu para primeiro nível.
		 *
		 * Enquanto era submenu dentro de "Empresa", cada tela de operação estava a
		 * dois cliques e uma adivinhação de distância. São sete assuntos, e cada um
		 * tem nome próprio: nada mais mora numa tela-depósito chamada
		 * "Configurações".
		 */
		label: 'nav.setup',
		items: [
			{ label: 'nav.process', icon: Workflow, to: '/processo-seletivo' },
			/* Campos próprios saíram de Estrutura: campo de formulário não é organograma. */
			{ label: 'nav.forms', icon: ClipboardList, to: '/formularios' },
			{ label: 'nav.communication', icon: Mail, to: '/comunicacao' },
			{ label: 'nav.portal', icon: Globe, to: '/portal-de-vagas' },
			{ label: 'nav.structure', icon: Network, to: '/estrutura' },
			// o recrutador não enxerga o mapa de quem é quem na empresa
			{ label: 'nav.team', icon: UsersRound, to: '/time', capability: 'team:read' },
			{ label: 'nav.companyData', icon: Building2, to: '/configuracoes' },
			{ label: 'nav.integrations', icon: Plug, to: '/integracoes', feature: 'integrations' },
		],
	},
	{
		/*
		 * O que existe por EDIÇÃO, não por papel.
		 *
		 * Hunting e Créditos são da Coploy hospedada; Servidor é da instalação
		 * aberta. Nenhuma instalação vê as três — e é por isso que elas não cabiam
		 * nos grupos do plano, que descrevem o ATS que todo mundo recebe.
		 */
		label: 'nav.edition',
		items: [
			{
				label: 'nav.hunting',
				icon: Search,
				to: '/hunting',
				capability: 'talent:read',
				feature: 'hunting',
			},
			{ label: 'nav.credits', icon: CreditCard, to: '/creditos', feature: 'billing' },
			{
				label: 'nav.server',
				icon: ServerCog,
				to: '/servidor',
				feature: 'instanceConfig',
				capability: 'settings:write',
			},
		],
	},
]

/**
 * Uma tela é alcançável quando o PAPEL e a EDIÇÃO permitem.
 *
 * Junta a regra declarada no item de menu com a da tabela `ACESSO_POR_TELA` —
 * a mesma que guarda a rota. Menu e rota discordarem foi como Créditos,
 * E-mails e Requisições sumiram do menu e continuaram abrindo por URL.
 */
function podeAlcancar(
	to: string,
	capabilityDoItem: string | undefined,
	featureDoItem: string | undefined,
	flagDoItem: string | undefined,
	can: (capability: string) => boolean,
	features: import('@/lib/capabilities').InstallationFeatures,
	flags: Record<string, boolean>,
): boolean {
	const daTabela = ACESSO_POR_TELA[to]
	const capability = capabilityDoItem ?? daTabela?.capability
	const feature = featureDoItem ?? daTabela?.feature
	if (feature && !features[feature as keyof import('@/lib/capabilities').InstallationFeatures])
		return false
	/* flag só ESCONDE do menu — a rota segue acessível por URL para quem tem a
	   capability, porque desligar a exigência não pode trancar quem já usou */
	if (flagDoItem && flags[flagDoItem] !== true) return false
	return !capability || can(capability)
}

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
	const { can, features, flags } = useCapabilities()
	// sem billing na edição (distribuição open) a chamada nem sai
	const { creditsTotal: credits } = useBillingUsage(features.billing)

	return (
		<aside
			className={cn(
				'flex h-full shrink-0 flex-col overflow-hidden border-border bg-surface transition-[width] duration-200 lg:rounded-xl lg:border lg:shadow-[0_1px_3px_rgba(15,16,20,0.04)]',
				mobile ? 'w-64 border-r' : collapsed ? 'w-16' : 'w-[216px]',
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
					/*
					 * O menu lê a MESMA tabela que guarda a rota (`ACESSO_POR_TELA`).
					 * Antes cada item declarava a sua regra aqui, e a rota declarava
					 * outra (ou nenhuma) — foi assim que Créditos, E-mails e
					 * Requisições continuaram alcançáveis por URL depois de sumirem
					 * do menu. Regra no item ainda vale, e soma.
					 */
					const items = group.items
						.filter((item) =>
							podeAlcancar(item.to, item.capability, item.feature, item.flag, can, features, flags),
						)
					// grupo sem itens não deixa rótulo órfão (ex.: Talentos na
					// distribuição open, onde Hunting não existe)
					if (items.length === 0) return null
					return (
						<div key={group.label} className='mb-4'>
							{(mobile || !collapsed) && (
								<div className='px-4 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted'>
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
										flags={flags}
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
				'group relative flex w-full items-center gap-2.5 py-2 text-[14px] text-text-2 transition-colors duration-150 hover:bg-hover hover:text-text',
				expanded ? (nested ? 'pl-11 pr-4' : 'px-4') : 'justify-center px-0',
			)}
			activeProps={{ className: 'bg-sel font-medium !text-text' }}
		>
			{({ isActive }) => (
				<>
					<span
						className={cn(
							'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-lime shadow-[0_0_8px_var(--lime)] transition-opacity duration-150',
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
	flags,
}: {
	item: NavItem
	collapsed: boolean
	mobile: boolean
	can: (capability: string) => boolean
	features: import('@/lib/capabilities').InstallationFeatures
	flags: Record<string, boolean>
}) {
	const { t } = useTranslation()
	const pathname = useRouterState({ select: (state) => state.location.pathname })
	const children = (item.children ?? [])
		.filter((child) =>
			podeAlcancar(child.to, child.capability, child.feature, child.flag, can, features, flags),
		)
		// mesma regra do topo: superfície que a edição não tem some do menu
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
					'group flex w-full items-center gap-2.5 px-4 py-2 text-[14px] transition-colors duration-150 hover:bg-hover hover:text-text',
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
