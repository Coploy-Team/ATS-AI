import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, RefreshCw, TrendingDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { stageFill, stageLabel } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { FilterPill } from '@/ui/filter-pill'
import { Banner, Card as Block, Page } from '@/ui/page'

import { MetricLabel } from './metric-label'
import { SourcePanel } from './source-panel'

/** Etapas do funil na ordem da régua — a conversão é entre vizinhas. */
const FUNNEL_STEPS = ['pending', 'selected', 'approved'] as const

/**
 * Analytics operacional.
 *
 * O que a nossa própria pesquisa (`gaps/research-02-ats-recruiter.md`) aponta
 * como risco: "F12 entrega painel tarde; o Lançamento 1 precisa de relatórios
 * operacionais mínimos (funil, time-in-stage, motivo) senão o RH exporta Excel
 * no dia 1". Esta tela é esse mínimo — e é construída sobre endpoints que já
 * existiam e ninguém no v2 usava.
 *
 * Não inventa métrica: mostra funil, conversão entre etapas, desempenho por
 * vaga e cumprimento de SLA. Time-to-fill de verdade exige data de contratação,
 * que só passa a existir agora que `hired` é etapa — então entra depois, com
 * dado real, em vez de virar um número inventado hoje.
 */
export function AnalyticsPage() {
	const navigate = useNavigate()
	const { t } = useTranslation()
	const now = new Date()
	const [month, setMonth] = useState(now.getMonth() + 1)
	const [year] = useState(now.getFullYear())

	const funnel = empresa.usePostDashboardFunnelBreakdown()
	const performance = empresa.usePostDashboardJobsPerformance()
	const distribution = empresa.usePostDashboardScoreDistribution()

	// As duas rotas são POST com filtro no corpo, então não são queries — o
	// efeito faz o papel do refetch: dispara no mount e a cada troca de
	// período. `mutate` é estável no TanStack Query, por isso fica fora das
	// deps sem risco de stale closure.
	const runFunnel = funnel.mutate
	const runPerformance = performance.mutate
	const runDistribution = distribution.mutate
	useEffect(() => {
		runFunnel({ data: { month, year } })
		runPerformance({ data: { month, year } })
		runDistribution({ data: { month, year } })
	}, [month, year, runFunnel, runPerformance, runDistribution])

	const { data: jobsData } = empresa.useGetCompaniesJobs({ limit: '100', status: 'active' })
	const jobs = jobsData?.data.jobs ?? []

	const breakdown = funnel.data?.data
	const rows = useMemo(() => performance.data?.data ?? [], [performance.data])

	/** Vaga com SLA estourado é o alerta que a tela existe pra dar. */
	const irregular = jobs.filter((job) => Boolean(job.slaIrregularSince))
	const withoutRuler = jobs.filter((job) => !job.feedbackSlaHours)

	const loading = funnel.isPending || performance.isPending
	const failed = funnel.isError || performance.isError

	function retry() {
		funnel.mutate({ data: { month, year } })
		performance.mutate({ data: { month, year } })
		distribution.mutate({ data: { month, year } })
	}

	const scores = distribution.data?.data
	/**
	 * Taxa de aprovação da empresa: o número que responde "nosso filtro está
	 * apertado demais ou frouxo demais". Sem ele, o funil é só contagem.
	 */
	const approvalRate =
		breakdown && breakdown.total > 0
			? Math.round(((breakdown.approved ?? 0) / breakdown.total) * 100)
			: null

	return (
		<Page
			title={t('analytics.title')}
			subtitle={t('analytics.subtitle')}
			actions={
				<FilterPill
					label={t('analytics.period')}
					value={String(month)}
					defaultValue={String(now.getMonth() + 1)}
					options={Array.from({ length: 12 }, (_, i) => ({
						value: String(i + 1),
						label: t(`analytics.months.${i + 1}`),
					}))}
					onChange={(value) => setMonth(Number(value))}
				/>
			}
		>
			{failed && (
				<Banner
					tone='danger'
					className='mb-4'
					actions={
						<Button variant='secondary' size='sm' onClick={retry}>
							<RefreshCw size={12} /> {t('jobs.retry')}
						</Button>
					}
				>
					{t('analytics.error')}
				</Banner>
			)}

			{/* alerta de SLA antes de qualquer gráfico: é o número que exige ação */}
			{(irregular.length > 0 || withoutRuler.length > 0) && (
				<div className='mb-4 flex flex-col gap-2'>
					{irregular.length > 0 && (
						<Banner tone='danger' icon={<AlertTriangle size={15} />}>
							<span className='font-medium'>
								{t('analytics.slaIrregular', { count: irregular.length })}
							</span>
							<span className='ml-1.5 opacity-80'>
								{irregular
									.slice(0, 3)
									.map((job) => job.jobName)
									.join(' · ')}
								{irregular.length > 3 && ` · +${irregular.length - 3}`}
							</span>
						</Banner>
					)}
					{withoutRuler.length > 0 && (
						<Banner icon={<TrendingDown size={15} className='text-lime-fg' />}>
							{t('analytics.withoutRuler', { count: withoutRuler.length })}
						</Banner>
					)}
				</div>
			)}

			<div className='mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
				<Kpi label={t('analytics.total')} value={breakdown?.total} loading={loading} />
				<Kpi
					label={t('analytics.avgScore')}
					value={scores?.avgScore ?? undefined}
					loading={loading}
					decimal
				/>
				<Kpi label={stageLabel('selected', t)} value={breakdown?.selected} loading={loading} />
				<Kpi
					label={stageLabel('approved', t)}
					value={breakdown?.approved}
					loading={loading}
					highlight
				/>
				<Kpi
					label={t('analytics.approvalRate')}
					value={approvalRate ?? undefined}
					suffix='%'
					loading={loading}
				/>
			</div>

			{/* distribuição de nota: diz se a régua da IA está calibrada pro nível
			    que a empresa contrata, coisa que a média sozinha esconde */}
			{scores && scores.totalScored > 0 && (
				<Block title={t('analytics.scoreTitle')} className='mb-4'>
					<div className='flex items-end gap-1.5' style={{ height: 120 }}>
						{scores.buckets.map((bucket) => {
							const max = Math.max(...scores.buckets.map((b) => b.count), 1)
							return (
								<div key={bucket.key} className='flex flex-1 flex-col items-center gap-1.5'>
									<span className='font-num text-[11px] text-muted'>{bucket.count}</span>
									<span
										className='w-full rounded-t bg-lime transition-all'
										style={{ height: `${Math.max((bucket.count / max) * 84, 2)}px` }}
									/>
									<span className='font-num text-[10.5px] text-muted'>{bucket.key}</span>
								</div>
							)
						})}
					</div>
					<p className='mt-2.5 text-[11px] text-muted'>
						{t('analytics.scoreHint', { count: scores.totalScored })}
					</p>
				</Block>
			)}

			{breakdown && breakdown.total > 0 && (
				<Block title={t('analytics.funnelTitle')} className='mb-4'>
					<div className='flex flex-col gap-2.5'>
						{FUNNEL_STEPS.map((step, index) => {
							const value = breakdown[step] ?? 0
							const previous =
								index === 0 ? breakdown.total : (breakdown[FUNNEL_STEPS[index - 1]] ?? 0)
							// conversão é entre etapas VIZINHAS; contra o total ela
							// esconde onde o funil realmente aperta
							const rate = previous > 0 ? Math.round((value / previous) * 100) : null

							return (
								<div key={step} className='flex items-center gap-3'>
									<span className='w-[110px] shrink-0 truncate text-[12px] text-text-2'>
										{stageLabel(step, t)}
									</span>
									<span className='h-5 flex-1 overflow-hidden rounded-md bg-data-track'>
										<span
											className={cn('block h-5 rounded-md', stageFill(step))}
											style={{
												width: `${breakdown.total > 0 ? (value / breakdown.total) * 100 : 0}%`,
											}}
										/>
									</span>
									<span className='font-num w-12 shrink-0 text-right text-[12.5px] font-medium'>
										{value}
									</span>
									<span className='font-num w-14 shrink-0 text-right text-[11.5px] text-muted'>
										{rate !== null ? `${rate}%` : '—'}
									</span>
								</div>
							)
						})}
					</div>
					<p className='mt-2.5 text-[11px] text-muted'>{t('analytics.funnelHint')}</p>
				</Block>
			)}

			<Block title={t('analytics.byJobTitle')} className='mb-4 [&>div]:p-0'>
				<div className='overflow-x-auto'>
					<table className='w-full border-collapse text-[13px]'>
						<thead>
							<tr className='border-b border-border text-left text-[10px] uppercase tracking-wider text-muted'>
								<th className='px-4 py-2.5 font-medium'>{t('analytics.job')}</th>
								<th className='px-4 py-2.5 text-right font-medium'>
									{t('analytics.interviews')}
								</th>
								<th className='px-4 py-2.5 text-right font-medium'>
									<MetricLabel metric='averageScore'>{t('analytics.avgScore')}</MetricLabel>
								</th>
								<th className='px-4 py-2.5 text-right font-medium'>
									{t('analytics.approvalRate')}
								</th>
								<th className='px-4 py-2.5 text-right font-medium'>
									<MetricLabel metric='timeToFill'>{t('analytics.daysOpen')}</MetricLabel>
								</th>
							</tr>
						</thead>
						<tbody>
							{loading &&
								Array.from({ length: 5 }, (_, i) => (
									<tr key={i} className='border-b border-border-soft last:border-0'>
										<td colSpan={5} className='px-4 py-3'>
											<div className='h-5 animate-pulse rounded bg-card-alt' />
										</td>
									</tr>
								))}

							{!loading && rows.length === 0 && (
								<tr>
									<td colSpan={5} className='px-4 py-12 text-center text-[12px] text-muted'>
										{t('analytics.empty')}
									</td>
								</tr>
							)}

							{rows.map((row) => (
								/*
								 * A linha LEVA À VAGA, como no dashboard.
								 *
								 * A tabela dizia qual vaga vai mal e parava aí — o recrutador
								 * lia o número e ia procurar a vaga no menu. Quem tem `jobId`
								 * abre; quem não tem (dado antigo sem referência) fica como
								 * estava, em vez de virar um clique que não faz nada.
								 */
								<tr
									key={row.jobId ?? row.jobName}
									onClick={() =>
										row.jobId && navigate({ to: '/vagas/$jobId', params: { jobId: row.jobId } })
									}
									className={cn(
										'border-b border-border-soft last:border-0',
										row.jobId && 'group cursor-pointer transition-colors hover:bg-hover',
									)}
								>
									<td className='max-w-[280px] px-4 py-2.5'>
										<span className='block truncate transition-colors group-hover:text-lime-fg'>
											{row.jobName}
										</span>
										{row.identifier && (
											<span className='font-num text-[11px] text-muted'>{row.identifier}</span>
										)}
									</td>
									<td className='font-num px-4 py-2.5 text-right'>{row.interviews}</td>
									<td className='font-num px-4 py-2.5 text-right'>
										{row.avgScore !== null && row.avgScore !== undefined
											? row.avgScore.toFixed(1).replace('.', ',')
											: '—'}
									</td>
									<td className='px-4 py-2.5 text-right'>
										{row.approvalRate !== null && row.approvalRate !== undefined ? (
											<span
												className={cn(
													'font-num text-[12.5px]',
													row.approvalRate >= 20 ? 'text-lime-fg' : 'text-text-2',
												)}
											>
												{Math.round(row.approvalRate)}%
											</span>
										) : (
											<span className='text-[12px] text-muted'>—</span>
										)}
									</td>
									<td className='font-num px-4 py-2.5 text-right text-text-2'>
										{row.daysOpen ?? '—'}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Block>

			{/* origem por último: responde "onde investir", não "o que fazer agora" */}
			<SourcePanel />
		</Page>
	)
}

function Kpi({
	label,
	value,
	loading,
	highlight,
	suffix,
	decimal,
}: {
	label: string
	value?: number
	loading: boolean
	highlight?: boolean
	suffix?: string
	decimal?: boolean
}) {
	return (
		<div
			className={cn(
				'rounded-xl border px-4 py-3',
				highlight ? 'border-lime-mid bg-lime-soft' : 'border-border bg-card',
			)}
		>
			<p className='text-[11.5px] text-text-2'>{label}</p>
			{loading ? (
				<div className='mt-1.5 h-7 w-16 animate-pulse rounded bg-card-alt' />
			) : (
				<p
					className={cn(
						'font-num mt-0.5 text-[26px] font-semibold leading-tight',
						highlight && 'text-lime-fg',
					)}
				>
					{value === undefined
						? '—'
						: decimal
							? value.toFixed(1).replace('.', ',')
							: value}
					{value !== undefined && suffix && (
						<span className='text-[16px] text-muted'>{suffix}</span>
					)}
				</p>
			)}
		</div>
	)
}
