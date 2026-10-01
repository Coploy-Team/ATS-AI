import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, RefreshCw, TrendingDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { stageFill, stageLabel } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'
import { BarsH, ColumnChart, type Ponto } from '@/ui/charts'
import { StageLegend } from '@/components/stage-bars'
import { toJobRow, type JobRow } from '@/features/jobs/map'
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
	const { t, i18n } = useTranslation()
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
	/*
	 * A operação, lida das vagas abertas (o que a open TEM, sem Motor): funil
	 * por vaga, vagas por área e nível, tempo aberta, régua de resposta e
	 * carga por recrutador. Tudo derivado da mesma listagem, sem rota nova.
	 */
	const linhas = useMemo(() => jobs.map(toJobRow), [jobs])
	const funilPorVaga = useMemo(
		() => linhas.filter((j) => j.totalCandidates > 0).sort((a, b) => b.totalCandidates - a.totalCandidates).slice(0, 8),
		[linhas],
	)
	const agrupar = (pick: (j: JobRow) => string | null) => {
		const m = new Map<string, { vagas: number; candidatos: number }>()
		for (const j of linhas) {
			const k = pick(j) || '—'
			const cur = m.get(k) ?? { vagas: 0, candidatos: 0 }
			m.set(k, { vagas: cur.vagas + 1, candidatos: cur.candidatos + j.totalCandidates })
		}
		return [...m.entries()].map(([label, v]) => ({ label, value: v.vagas, hint: `${v.candidatos} cand.` })).sort((a, b) => b.value - a.value).slice(0, 8)
	}
	const porArea = useMemo(() => agrupar((j) => j.segment), [linhas])
	const porNivel = useMemo(() => agrupar((j) => j.level), [linhas])
	const porRecrutador = useMemo(() => agrupar((j) => j.creator), [linhas])
	const tempoAberta = useMemo(() => {
		const faixas: Array<[string, (d: number) => boolean]> = [
			['0–7', (d) => d <= 7],
			['8–14', (d) => d > 7 && d <= 14],
			['15–30', (d) => d > 14 && d <= 30],
			['31–60', (d) => d > 30 && d <= 60],
			['60+', (d) => d > 60],
		]
		return faixas.map(([label, ok]) => ({ label: `${label} ${t('analytics.daysShort')}`, tick: label, value: linhas.filter((j) => j.openForDays !== null && ok(j.openForDays)).length }))
	}, [linhas, t])
	const respostaCandidato = useMemo(() => {
		const semRegua = linhas.filter((j) => j.sla.ruleHours === null).length
		const estourada = linhas.filter((j) => j.sla.breachedForMs !== null).length
		const emDia = linhas.length - semRegua - estourada
		return [
			{ label: t('analytics.slaOk'), value: emDia },
			{ label: t('analytics.slaBreached'), value: estourada },
			{ label: t('analytics.slaNone'), value: semRegua },
		]
	}, [linhas, t])

	const breakdown = funnel.data?.data
	const rows = useMemo(() => performance.data?.data ?? [], [performance.data])
	// candidaturas do período, dia a dia (a lista aceita from/to)
	const { from, to } = useMemo(() => {
		const inicio = new Date(year, month - 1, 1)
		const fim = new Date(year, month, 0)
		return { from: inicio.toISOString().slice(0, 10), to: fim.toISOString().slice(0, 10) }
	}, [month, year])
	const periodo = empresa.useGetCompaniesInterviews({ page: '1', limit: '500', from, to } as never)
	const porDiaPontos = useMemo(() => {
		const dias = new Date(year, month, 0).getDate()
		const lista = ((periodo.data?.data as { interviews?: Array<{ date?: string | null }> } | undefined)?.interviews ?? []).map((r) => r.date)
		return porDiaDoMes(lista, year, month, dias, i18n.language)
	}, [periodo.data, month, year, i18n.language])

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

			<div className='mb-4 grid gap-4 lg:grid-cols-2'>
				<Block title={t('analytics.applicationsTitle')}>
					<ColumnChart points={porDiaPontos} empty={t('analytics.noApplications')} />
				</Block>
				<Block title={t('analytics.byJobChartTitle')}>
					<BarsH
						rows={rows
							.slice()
							.sort((a, b) => b.interviews - a.interviews)
							.slice(0, 8)
							.map((r) => ({ label: r.jobName, value: r.interviews, hint: r.approvalRate !== null && r.approvalRate !== undefined ? `${Math.round(r.approvalRate)}%` : undefined }))}
						empty={t('analytics.emptyJobs')}
					/>
				</Block>
			</div>

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

			{linhas.length > 0 && (
				<>
					<h2 className='mb-3 mt-6 font-display text-[18px] font-bold tracking-[-0.01em]'>{t('analytics.opsTitle')}</h2>
					<p className='-mt-2 mb-3 text-[13px] text-text-2'>{t('analytics.opsHint')}</p>
					<div className='mb-4 grid gap-4 lg:grid-cols-2'>
						<Block title={t('analytics.funnelByJobTitle')}>
							{funilPorVaga.length === 0 ? (
								<p className='py-6 text-center text-[12.5px] text-muted'>{t('analytics.emptyJobs')}</p>
							) : (
								<ol className='flex flex-col gap-2.5'>
									{funilPorVaga.map((j) => (
										<li key={j.id} className='flex items-center gap-3'>
											<span className='w-[38%] min-w-0 truncate text-[12.5px] text-text-2'>{j.title}</span>
											<span className='flex h-[8px] flex-1 gap-px overflow-hidden rounded-full bg-data-track'>
												{j.stages.map((st) => (
													<span
														key={st.key}
														title={`${stageLabel(st.key, t)}: ${st.count}`}
														style={{ width: `${(st.count / j.totalCandidates) * 100}%` }}
														className={cn('block h-full min-w-[3px]', stageFill(st.key))}
													/>
												))}
											</span>
											<span className='w-10 shrink-0 text-right font-display text-[13px] font-semibold tabular-nums'>{j.totalCandidates}</span>
										</li>
									))}
								</ol>
							)}
							<StageLegend className='mt-3' />
						</Block>
						<Block title={t('analytics.openForTitle')}>
							<ColumnChart points={tempoAberta} height={120} />
							<p className='mt-2 text-[11.5px] text-muted'>{t('analytics.openForHint')}</p>
						</Block>
						<Block title={t('analytics.byAreaTitle')}>
							<BarsH rows={porArea} empty={t('analytics.emptyJobs')} />
						</Block>
						<Block title={t('analytics.byLevelTitle')}>
							<BarsH rows={porNivel} empty={t('analytics.emptyJobs')} />
						</Block>
						<Block title={t('analytics.slaTitle')}>
							<BarsH rows={respostaCandidato} />
							<p className='mt-2 text-[11.5px] text-muted'>{t('analytics.slaHint')}</p>
						</Block>
						<Block title={t('analytics.byRecruiterTitle')}>
							<BarsH rows={porRecrutador} empty={t('analytics.emptyJobs')} />
						</Block>
					</div>
				</>
			)}

			<Block title={t('analytics.byJobTitle')} className='mb-4 [&>div]:p-0'>
				<div className='overflow-x-auto'>
					<table className='w-full border-collapse text-[14px]'>
						<thead>
							<tr className='border-b border-border text-left'>
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


/** Agrupa datas ISO por dia dentro do mês escolhido. */
function porDiaDoMes(dates: Array<string | null | undefined>, year: number, month: number, dias: number, locale: string): Ponto[] {
	const buckets = new Map<number, number>()
	for (let d = 1; d <= dias; d++) buckets.set(d, 0)
	for (const iso of dates) {
		if (!iso) continue
		const dt = new Date(iso)
		if (dt.getFullYear() === year && dt.getMonth() === month - 1) buckets.set(dt.getDate(), (buckets.get(dt.getDate()) ?? 0) + 1)
	}
	return Array.from({ length: dias }, (_, i) => {
		const d = i + 1
		const date = new Date(year, month - 1, d)
		return {
			label: date.toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
			value: buckets.get(d) ?? 0,
			tick: d === 1 || d % 5 === 0 ? String(d) : undefined,
		}
	})
}
