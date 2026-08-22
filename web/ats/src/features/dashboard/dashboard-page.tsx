import { Link } from '@tanstack/react-router'
import {
	AlertTriangle,
	ArrowRight,
	Briefcase,
	CheckCircle2,
	Clock,
	Star,
	Users,
} from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { FirstRun } from './first-run'
import { cn } from '@/lib/cn'
import { Page } from '@/ui/page'

/**
 * A operação, ao entrar.
 *
 * A primeira versão derivava tudo da listagem de vagas para não custar chamada
 * nova. Custou pior: virou uma lista de pendências sem número nenhum — não
 * respondia quantas entrevistas rodaram, qual a nota média, onde o funil trava.
 * "Zero rota nova" só é economia quando a rota existente não responde melhor, e
 * aqui `/dashboard/*` responde: são os mesmos números da v1, calculados no
 * servidor.
 *
 * A fila também passou a vir do servidor (`/dashboard/inbox`), que classifica
 * por severidade e enxerga caso que a listagem de vagas não conta — nota alta
 * sem decisão, por exemplo.
 */
interface InboxItem {
	type: string
	severity: 'high' | 'medium' | 'low'
	title: string
	description: string
	count: number
	ageDays?: number | null
	href?: string
}

const TONE = {
	high: {
		card: 'border-l-[3px] border-l-danger',
		value: 'text-danger',
		chip: 'bg-danger-soft text-danger',
	},
	medium: {
		card: 'border-l-[3px] border-l-amber',
		value: 'text-amber',
		chip: 'bg-amber-soft text-amber',
	},
	low: {
		card: 'border-l-[3px] border-l-lime',
		value: '',
		chip: 'bg-lime-soft text-lime-fg',
	},
} as const

function Kpi({
	icon: Icon,
	label,
	value,
	hint,
	tone = 'low',
}: {
	icon: typeof Clock
	label: string
	value: string
	hint?: string
	tone?: keyof typeof TONE
}) {
	return (
		<div
			className={cn(
				'flex flex-col gap-1 rounded-xl border border-border bg-card p-4',
				TONE[tone].card,
			)}
		>
			<span className='flex items-center gap-1.5 text-[11.5px] text-text-2'>
				<Icon size={12} className='shrink-0' />
				{label}
			</span>
			<span className={cn('font-num text-[28px] font-semibold leading-none', TONE[tone].value)}>
				{value}
			</span>
			{hint && <span className='text-[11px] text-muted'>{hint}</span>}
		</div>
	)
}

/**
 * O funil como uma barra empilhada.
 *
 * Empilhado, não lado a lado, porque a pergunta é "onde as pessoas param" — e
 * isso se lê na PROPORÇÃO. Quatro barras separadas obrigam o olho a comparar
 * alturas; uma barra só mostra o gargalo de relance.
 */
function Funnel({
	stages,
	total,
}: {
	stages: Array<{ label: string; value: number; className: string }>
	total: number
}) {
	const { t } = useTranslation()
	if (total === 0) {
		return <p className='py-6 text-center text-[12.5px] text-muted'>{t('dashboard.noData')}</p>
	}

	return (
		<div className='flex flex-col gap-3'>
			<div className='flex h-2.5 overflow-hidden rounded-full bg-card-alt'>
				{stages.map((stage) => (
					<span
						key={stage.label}
						className={stage.className}
						style={{ width: `${(stage.value / total) * 100}%` }}
						title={`${stage.label}: ${stage.value}`}
					/>
				))}
			</div>
			<div className='grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4'>
				{stages.map((stage) => (
					<div key={stage.label} className='flex items-center gap-1.5'>
						<span className={cn('h-2 w-2 shrink-0 rounded-full', stage.className)} />
						<span className='min-w-0 flex-1 truncate text-[11.5px] text-text-2'>{stage.label}</span>
						<span className='font-num text-[12.5px] font-medium'>{stage.value}</span>
					</div>
				))}
			</div>
		</div>
	)
}

/** Distribuição de notas — mostra se a régua da vaga está calibrada. */
function ScoreBars({ buckets }: { buckets: Array<{ key: string; count: number }> }) {
	const { t } = useTranslation()
	const max = Math.max(1, ...buckets.map((bucket) => bucket.count))

	if (buckets.length === 0 || buckets.every((bucket) => bucket.count === 0)) {
		return <p className='py-6 text-center text-[12.5px] text-muted'>{t('dashboard.noData')}</p>
	}

	return (
		<div className='flex items-end gap-1.5'>
			{buckets.map((bucket) => (
				<div key={bucket.key} className='flex min-w-0 flex-1 flex-col items-center gap-1'>
					<span className='font-num text-[10.5px] text-muted'>{bucket.count || ''}</span>
					<span
						className='w-full rounded-t bg-lime'
						style={{ height: `${Math.max(2, (bucket.count / max) * 64)}px` }}
					/>
					<span className='font-num truncate text-[10px] text-muted'>{bucket.key}</span>
				</div>
			))}
		</div>
	)
}

function TaskRow({ item }: { item: InboxItem }) {
	const { t } = useTranslation()
	const tone = TONE[item.severity] ?? TONE.low

	const body = (
		<>
			<span className='min-w-0 flex-1'>
				<span className='block truncate text-[13px] font-medium'>{item.title}</span>
				<span className='block truncate text-[11.5px] text-muted'>{item.description}</span>
			</span>

			{item.count > 1 && <span className='font-num shrink-0 text-[12px] text-muted'>{item.count}</span>}

			<span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', tone.chip)}>
				{item.ageDays ? t('dashboard.ageDays', { count: Math.round(item.ageDays) }) : t('dashboard.now')}
			</span>
		</>
	)

	const className =
		'flex flex-wrap items-center gap-3 border-b border-border-soft px-4 py-2.5 transition-colors last:border-0'

	/*
	 * O `href` vem do servidor no formato de rota da v1 e nem sempre existe como
	 * rota do ATS. Linha sem destino conhecido não vira link morto: fica como
	 * informação, e o recrutador chega pelo menu.
	 */
	return item.href?.startsWith('/vagas') ? (
		<Link to={item.href as never} className={cn(className, 'hover:bg-hover')}>
			{body}
			<ArrowRight size={12} className='shrink-0 text-lime-fg' />
		</Link>
	) : (
		<div className={className}>{body}</div>
	)
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className='rounded-xl border border-border bg-card'>
			<header className='border-b border-border-soft px-4 py-2.5'>
				<h2 className='text-[13px] font-medium'>{title}</h2>
			</header>
			<div className='p-4'>{children}</div>
		</section>
	)
}

export function DashboardPage() {
	const { t, i18n } = useTranslation()

	const home = empresa.useGetDashboardHome()
	/*
	 * Uma chamada só para saber se a empresa já tem vaga. `limit: 1` porque a
	 * pergunta é "existe alguma?", não "quais são" — e a resposta decide entre
	 * o painel e o primeiro acesso.
	 */
	const primeirasVagas = empresa.useGetCompaniesJobs({ limit: '1', page: '1', status: 'all' })
	const inbox = empresa.usePostDashboardInbox()
	const funnel = empresa.usePostDashboardFunnelBreakdown()
	const scores = empresa.usePostDashboardScoreDistribution()

	/*
	 * Os três painéis são POST (herança da v1, que mandava `uidCompany` no
	 * corpo), então no SDK viram mutation e precisam ser disparados. Uma vez, na
	 * montagem: o dashboard não é tela de tempo real.
	 */
	const { mutate: loadInbox } = inbox
	const { mutate: loadFunnel } = funnel
	const { mutate: loadScores } = scores
	useEffect(() => {
		loadInbox({ data: {} })
		loadFunnel({ data: {} })
		loadScores({ data: {} })
	}, [loadInbox, loadFunnel, loadScores])

	const summary = home.data?.data
	const inboxData = inbox.data?.data as
		| { items?: InboxItem[]; avgFeedbackTimeDays?: number | null }
		| undefined
	const funnelData = funnel.data?.data as
		| { total: number; pending: number; selected: number; approved: number; rejected: number }
		| undefined
	const scoreData = scores.data?.data as
		| { buckets: Array<{ key: string; count: number }>; totalScored: number; avgScore: number | null }
		| undefined

	/*
	 * Os painéis do topo são do MÊS CORRENTE (é o recorte do `/dashboard/*` da
	 * v1). Sem dizer isso, "3 vagas" ao lado de uma lista com 131 parece defeito
	 * — o número está certo, faltava a pergunta que ele responde.
	 */
	const monthLabel = new Date().toLocaleDateString(i18n.language, {
		month: 'long',
		year: 'numeric',
	})

	const items = inboxData?.items ?? []
	const avgFeedback = inboxData?.avgFeedbackTimeDays

	const stages = funnelData
		? [
				/*
				 * Rótulos próprios: as chaves de `stages.*` nomeiam COLUNAS do quadro
				 * ("Entrevista IA"), e o funil agrega estados. Reaproveitar fazia a
				 * legenda dizer o nome de uma etapa no lugar de um estado.
				 */
				{ label: t('dashboard.funnelPending'), value: funnelData.pending, className: 'bg-muted/40' },
				{ label: t('dashboard.funnelSelected'), value: funnelData.selected, className: 'bg-lime-mid' },
				{ label: t('dashboard.funnelApproved'), value: funnelData.approved, className: 'bg-lime' },
				{ label: t('dashboard.funnelRejected'), value: funnelData.rejected, className: 'bg-danger/60' },
			]
		: []

	const totalDeVagas = primeirasVagas.data?.data.pagination?.total

	/*
	 * Empresa sem nenhuma vaga vê o primeiro acesso, não um painel de zeros.
	 * Enquanto a contagem não chegou não decidimos nada: piscar o onboarding e
	 * trocá-lo pelo painel meio segundo depois é pior que esperar.
	 */
	if (totalDeVagas === 0) {
		return (
			<Page title={t('firstRun.pageTitle')} subtitle={t('firstRun.pageSubtitle')}>
				<FirstRun />
			</Page>
		)
	}

	return (
		<Page
			title={t('dashboard.title')}
			subtitle={t('dashboard.subtitleMonth', { month: monthLabel })}
		>
			<div className='flex flex-col gap-4'>
				<div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
					<Kpi
						icon={Briefcase}
						label={t('dashboard.kpiJobs')}
						value={home.isLoading ? '—' : String(summary?.jobs.total ?? 0)}
					/>
					<Kpi
						icon={Users}
						label={t('dashboard.kpiInterviews')}
						value={home.isLoading ? '—' : String(summary?.interviews.total ?? 0)}
						hint={t('dashboard.kpiApproved', { count: summary?.approved.total ?? 0 })}
					/>
					<Kpi
						icon={Star}
						label={t('dashboard.kpiScore')}
						/*
						 * `scoreAvg` é `{ value, sampleSize }`, não número — ler direto
						 * dava `NaN` na tela. E `value: 0` significa "ninguém pontuado no
						 * mês", que não é nota zero: mostra travessão.
						 */
						value={
							!summary?.scoreAvg?.sampleSize
								? '—'
								: summary.scoreAvg.value.toFixed(1).replace('.', ',')
						}
						hint={t('dashboard.kpiScoreHint', { count: summary?.scoreAvg?.sampleSize ?? 0 })}
					/>
					{/*
					 * Tempo de resposta é o número do anti-ghosting — o que o produto
					 * promete ao candidato. Vermelho a partir de 7 dias porque aí a
					 * promessa está sendo quebrada, não "está alto".
					 */}
					<Kpi
						icon={Clock}
						label={t('dashboard.kpiFeedback')}
						tone={typeof avgFeedback === 'number' && avgFeedback > 7 ? 'high' : 'low'}
						value={
							avgFeedback === null || avgFeedback === undefined
								? '—'
								: t('dashboard.days', { count: Math.round(avgFeedback) })
						}
						hint={t('dashboard.kpiFeedbackHint')}
					/>
				</div>

				<div className='grid gap-4 lg:grid-cols-2'>
					<Panel title={t('dashboard.funnelTitleMonth')}>
						{funnel.isPending ? (
							<div className='h-20 animate-pulse rounded-lg bg-card-alt' />
						) : (
							<Funnel stages={stages} total={funnelData?.total ?? 0} />
						)}
					</Panel>

					<Panel title={t('dashboard.scoresTitle')}>
						{scores.isPending ? (
							<div className='h-24 animate-pulse rounded-lg bg-card-alt' />
						) : (
							<>
								<ScoreBars buckets={scoreData?.buckets ?? []} />
								{scoreData?.avgScore !== null && scoreData?.avgScore !== undefined && (
									<p className='mt-2 text-[11.5px] text-muted'>
										{t('dashboard.scoresHint', {
											avg: Number(scoreData.avgScore).toFixed(1).replace('.', ','),
											count: scoreData.totalScored,
										})}
									</p>
								)}
							</>
						)}
					</Panel>
				</div>

				<div className='rounded-xl border border-border bg-card'>
					<header className='flex items-center gap-2 border-b border-border-soft px-4 py-2.5'>
						<AlertTriangle size={14} className='shrink-0 text-text-2' />
						<h2 className='flex-1 text-[13px] font-medium'>{t('dashboard.tasksTitle')}</h2>
						{items.length > 0 && (
							<span className='font-num text-[11.5px] text-muted'>{items.length}</span>
						)}
					</header>

					{inbox.isPending && <div className='m-4 h-20 animate-pulse rounded-lg bg-card-alt' />}

					{/* fila vazia é boa notícia, e a tela diz isso */}
					{!inbox.isPending && items.length === 0 && (
						<div className='px-4 py-12 text-center'>
							<CheckCircle2 size={20} className='mx-auto mb-2 text-lime-fg' />
							<p className='text-[13px] font-medium'>{t('dashboard.clearTitle')}</p>
							<p className='mt-0.5 text-[12px] text-muted'>{t('dashboard.clearHint')}</p>
						</div>
					)}

					{items.map((item, index) => (
						<TaskRow key={`${item.type}-${index}`} item={item} />
					))}
				</div>
			</div>
		</Page>
	)
}
