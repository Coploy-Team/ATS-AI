import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import {
	AlertTriangle,
	ArrowRight,
	CalendarClock,
	CheckCircle2,
	Clock,
	Copy,
	PencilLine,
	Star,
	Users,
} from 'lucide-react'

import { empresa } from '@coploy/sdk/react'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { stagger } from '@/lib/motion'
import { Card, Page } from '@/ui/page'
import { Button } from '@/ui/button'
import { CountUp } from '@/ui/count-up'
import { Markdown } from '@/ui/markdown'
import { StatusBadge, type JobStatus } from '@/components/status-badge'

type Blocker = { field: string; reason: string }

type JobOverview = {
	jobName?: string
	status?: string
	stopped?: boolean
	archived?: boolean
	public?: boolean
	carrerLevel?: string
	jobCategories?: string
	contractType?: string
	jobModel?: string
	workModality?: string
	employmentType?: string
	salary?: string | null
	benefits?: string | null
	jobDescription?: string
	jobRequirements?: string
	jobResponsabilities?: string
	competencias_criticas?: string
	competencias_adicionais?: string
	jobQuestions?: Array<{ question?: string }>
	address?: { city?: string; state?: string; country?: string }
	feedbackSlaHours?: number | null
	timeCreated?: string
	closingDate?: string | null
	creatorName?: string | null
	typeInterview?: string
	publishBlockers?: Blocker[]
	candidatesMetrics?: {
		totalCandidates?: number
		daysElapsed?: number
		dailyAverage?: string
		averageScore?: string
		status?: { pending?: number; selected?: number; approved?: number; rejected?: number }
		percentages?: { pending?: number; selected?: number; approved?: number; rejected?: number }
	}
}

function statusDaVaga(job: JobOverview | undefined): JobStatus {
	if (job?.status === 'draft') return 'rascunho'
	if (job?.archived) return 'arquivada'
	if (job?.stopped) return 'pausada'
	return 'aberta'
}

/** Uma competência por linha; o chip é o nome, antes do " — " ou ":". */
function chips(text: string | undefined): string[] {
	return (text ?? '')
		.split('\n')
		.map((l) => l.trim().replace(/^[-•*]\s*/, ''))
		.filter(Boolean)
		.map((l) => l.split(/\s[—–-]\s|:\s/)[0].trim())
}

/**
 * A capa da vaga.
 *
 * Entrar numa vaga caía direto no quadro — o que serve para a vaga que já está
 * rodando, e não serve para nenhuma outra: rascunho abre num quadro vazio, vaga
 * pausada não conta por que parou, e ninguém vê de quem a vaga é sem abrir a
 * lista de novo.
 *
 * E a capa conta a VAGA (pedido do Henrique, 2026-09-04: "não tem dados de
 * nada"): os números que a v1 mostrava — tempo aberta, encerra em, média,
 * total, funil por etapa — e o que a vaga diz: descrição, requisitos,
 * competências, roteiro, salário, régua.
 */
export function JobOverviewPage() {
	const { t, i18n } = useTranslation()
	const { jobId } = useParams({ strict: false }) as { jobId: string }
	const { data, isLoading } = empresa.useGetCompaniesJobsSlug(jobId, {
		query: { enabled: Boolean(jobId) },
	})
	const job = data?.data as JobOverview | undefined

	const { can, features } = useCapabilities()
	const criarModelo = empresa.usePostCompaniesJobTemplates()
	const [salvandoModelo, setSalvandoModelo] = useState(false)
	const [nomeModelo, setNomeModelo] = useState('')
	const [modeloSalvo, setModeloSalvo] = useState(false)

	const status = statusDaVaga(job)
	const blockers = job?.publishBlockers ?? []
	const ehRascunho = status === 'rascunho'
	const m = job?.candidatesMetrics
	const total = m?.totalCandidates ?? 0
	const fmtData = (iso?: string | null) =>
		iso ? new Date(iso).toLocaleDateString(i18n.language) : null
	const criticas = chips(job?.competencias_criticas)
	const adicionais = chips(job?.competencias_adicionais)
	const local = [job?.address?.city, job?.address?.state].filter(Boolean).join(', ')
	const perguntas = job?.jobQuestions?.length ?? 0

	const kpis: Array<{ icon: typeof Clock; label: string; value: React.ReactNode; hint: string; hot?: boolean; texto?: boolean }> = [
		{
			icon: Clock,
			label: t('jobOverview.openFor'),
			value: <CountUp value={m?.daysElapsed ?? 0} format={(n) => t('jobOverview.days', { count: n })} />,
			hint: fmtData(job?.timeCreated) ? t('jobOverview.publishedAt', { date: fmtData(job?.timeCreated) }) : '',
		},
		{
			icon: CalendarClock,
			label: t('jobOverview.closesAt'),
			value: fmtData(job?.closingDate) ?? t('jobOverview.notSet'),
			hint: job?.closingDate ? '' : t('jobOverview.closesHint'),
			texto: true,
		},
		...(features.motor
			? [
					{
						icon: Star,
						label: t('jobOverview.avgScore'),
						value: total > 0 ? (m?.averageScore ?? '0.0').replace('.', ',') : '—',
						hint: t('jobOverview.basedOn', { count: total }),
						hot: total > 0,
					},
				]
			: []),
		{
			icon: Users,
			label: t('jobOverview.totalCandidates'),
			value: <CountUp value={total} />,
			hint: t('jobOverview.perDay', { n: (m?.dailyAverage ?? '0').replace('.', ',') }),
		},
	]
	const funil: Array<{ key: 'pending' | 'selected' | 'approved' | 'rejected'; tone: string }> = [
		{ key: 'pending', tone: 'bg-lime/45' },
		{ key: 'selected', tone: 'bg-lime/70' },
		{ key: 'approved', tone: 'bg-lime' },
		{ key: 'rejected', tone: 'bg-data-done/60' },
	]

	return (
		<Page title={t('jobOverview.title')} subtitle={t('jobOverview.subtitle')}>
			<div className='flex flex-col gap-5'>
				{/* os números — a fileira que a v1 tinha e esta tela não */}
				{!ehRascunho && (
					<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
						{kpis.map((k, i) => (
							<div
								key={k.label}
								style={stagger(i)}
								className='rise lift flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5 shadow-card'
							>
								<span className='flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>
									<k.icon size={12} className='shrink-0' />
									{k.label}
								</span>
								<span
									className={cn(
										// número conta em 34px; data e texto ("Não definido") cabem em 24px e podem quebrar
										'min-w-0 break-words font-display font-extrabold leading-none tracking-[-0.02em] tabular-nums',
										k.texto ? 'text-[24px] leading-tight' : 'text-[34px]',
										k.hot && 'text-lime-fg',
									)}
								>
									{isLoading ? '—' : k.value}
								</span>
								{k.hint && <span className='text-[12px] text-muted'>{k.hint}</span>}
							</div>
						))}
					</div>
				)}

				{/* o funil: quantos em cada etapa, e a fatia do total */}
				{!ehRascunho && (
					<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
						{funil.map((f, i) => {
							const n = m?.status?.[f.key] ?? 0
							const pct = m?.percentages?.[f.key] ?? 0
							return (
								<div
									key={f.key}
									style={stagger(i + 4)}
									className='rise flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-card'
								>
									<span className='flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>
										<span className={cn('h-2 w-2 rounded-full', f.tone)} />
										{t(`jobOverview.funnel.${f.key}`)}
									</span>
									<span className='font-display text-[28px] font-bold leading-none tabular-nums'>
										{isLoading ? '—' : <CountUp value={n} />}
									</span>
									<span className='relative h-[6px] overflow-hidden rounded-full bg-data-track'>
										<span
											style={{ transform: `scaleX(${Math.min(1, pct / 100)})`, ...stagger(i + 4, 80, 600) }}
											className={cn('fill absolute inset-0 rounded-full', f.tone)}
										/>
									</span>
									<span className='text-[12px] text-muted'>{t('jobOverview.ofTotal', { pct: String(pct).replace('.', ',') })}</span>
								</div>
							)
						})}
					</div>
				)}

				<div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'>
					<div className='flex min-w-0 flex-col gap-4'>
						{/*
						 * O que falta vem do SERVIDOR, com o mesmo cálculo que recusa a
						 * publicação. Recalcular aqui criaria duas versões da regra que
						 * divergem na primeira mudança.
						 */}
						{ehRascunho && (
							<Card title={t(blockers.length === 0 ? 'jobOverview.readyTitle' : 'jobOverview.missingTitle')}>
								{blockers.length === 0 ? (
									<div className='flex flex-col gap-3'>
										<p className='flex items-start gap-2 text-[13px] text-text-2'>
											<CheckCircle2 size={15} className='mt-px shrink-0 text-lime-fg' />
											{t('jobOverview.readyBody')}
										</p>
										<Link to='/vagas/$jobId/editar' params={{ jobId }}>
											<Button variant='primary'>
												{t('jobOverview.reviewAndPublish')} <ArrowRight size={13} />
											</Button>
										</Link>
									</div>
								) : (
									<div className='flex flex-col gap-3'>
										<ul className='flex flex-col gap-2'>
											{blockers.map((b) => (
												<li key={b.field} className='flex items-start gap-2 text-[13px] text-text-2'>
													<AlertTriangle size={15} className='mt-px shrink-0 text-amber' />
													{b.reason}
												</li>
											))}
										</ul>
										<Link to='/vagas/$jobId/editar' params={{ jobId }}>
											<Button variant='secondary'>
												<PencilLine size={13} /> {t('jobOverview.continueEditing')}
											</Button>
										</Link>
									</div>
								)}
							</Card>
						)}

						<Card
							title={t('jobOverview.aboutTitle')}
							actions={
								<Link to='/vagas/$jobId/editar' params={{ jobId }}>
									<Button variant='ghost' size='sm'>
										<PencilLine size={12} /> {t('jobOverview.edit')}
									</Button>
								</Link>
							}
						>
							<dl className='grid gap-x-8 gap-y-2.5 text-[13.5px] md:grid-cols-2'>
								<Linha rotulo={t('jobOverview.level')} valor={job?.carrerLevel} />
								<Linha rotulo={t('jobOverview.category')} valor={job?.jobCategories} />
								<Linha
									rotulo={t('jobOverview.contract')}
									valor={[job?.contractType ?? job?.employmentType, job?.jobModel ?? job?.workModality].filter(Boolean).join(' · ')}
								/>
								<Linha rotulo={t('jobOverview.location')} valor={local} />
								<Linha rotulo={t('jobOverview.salary')} valor={job?.salary} />
								<Linha
									rotulo={t('jobOverview.sla')}
									valor={job?.feedbackSlaHours ? t('jobConfig.slaPreset', { hours: job.feedbackSlaHours }) : t('jobs.slaNotSet')}
								/>
								<Linha rotulo={t('jobOverview.owner')} valor={job?.creatorName} />
								<Linha
									rotulo={t('jobOverview.visibility')}
									valor={t(job?.public ? 'jobForm.visiblePublic' : 'jobForm.visiblePrivate')}
								/>
								<Linha
									rotulo={t('jobOverview.script')}
									valor={perguntas > 0 ? t('jobOverview.questionsCount', { count: perguntas }) : '—'}
								/>
							</dl>
						</Card>

						{(criticas.length > 0 || adicionais.length > 0) && (
							<Card title={t('jobOverview.competencies')}>
								<div className='flex flex-wrap gap-1.5'>
									{criticas.map((c, i) => (
										<span key={'c' + i} className='rounded-full bg-lime-soft px-2.5 py-[3px] text-[12.5px] font-semibold text-lime-fg'>
											{c}
										</span>
									))}
									{adicionais.map((c, i) => (
										<span key={'a' + i} className='rounded-full border border-border px-2.5 py-[3px] text-[12.5px] text-text-2'>
											{c}
										</span>
									))}
								</div>
							</Card>
						)}

						<Card title={t('jobOverview.description')}>
							{job?.jobDescription?.trim() ? (
								<Markdown text={job.jobDescription} className='text-[13.5px]' />
							) : (
								<p className='text-[13px] text-muted'>{t('jobOverview.noDescription')}</p>
							)}
						</Card>

						{job?.jobRequirements?.trim() && (
							<Card title={t('jobOverview.requirements')}>
								<Markdown text={job.jobRequirements} className='text-[13.5px]' />
							</Card>
						)}

						{job?.benefits?.trim() && (
							<Card title={t('jobOverview.benefits')}>
								<Markdown text={job.benefits} className='text-[13.5px]' />
							</Card>
						)}

						{/*
						 * A porta que faz o acervo de modelos existir.
						 *
						 * Ela mora AQUI, e não numa tela de cadastro: o modelo nasce de uma
						 * vaga que alguém já escreveu. Pedir que se escreva o modelo antes
						 * de precisar dele é o que faz catálogo nascer vazio.
						 */}
						{can('settings:write') && (
							<Card title={t('jobOverview.templateTitle')}>
								{modeloSalvo ? (
									<p className='flex items-center gap-2 text-[13px] text-text-2'>
										<CheckCircle2 size={15} className='shrink-0 text-lime-fg' />
										{t('jobOverview.templateSaved')}
									</p>
								) : (
									<div className='flex flex-col gap-2.5'>
										<p className='text-[12.5px] text-muted'>{t('jobOverview.templateHint')}</p>
										<div className='flex flex-wrap items-center gap-2'>
											<input
												value={nomeModelo}
												onChange={(e) => setNomeModelo(e.target.value)}
												placeholder={t('jobOverview.templateNamePlaceholder')}
												className='h-8 min-w-[220px] flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text'
											/>
											<Button
												variant='secondary'
												disabled={!nomeModelo.trim() || salvandoModelo}
												onClick={async () => {
													setSalvandoModelo(true)
													try {
														await criarModelo.mutateAsync({
															data: { name: nomeModelo.trim(), fromJobId: jobId } as never,
														})
														setModeloSalvo(true)
													} finally {
														setSalvandoModelo(false)
													}
												}}
											>
												<Copy size={13} /> {t('jobOverview.templateSave')}
											</Button>
										</div>
									</div>
								)}
							</Card>
						)}
					</div>

					<div className='flex flex-col gap-4 xl:sticky xl:top-0 xl:self-start'>
						<Card title={t('jobOverview.statusTitle')}>
							<div className='flex flex-col items-start gap-3'>
								<StatusBadge status={status} />
								<p className='text-[12.5px] text-muted'>{t(`jobOverview.statusHint.${status}`)}</p>
								{!ehRascunho && (
									<Link to='/vagas/$jobId/pipeline' params={{ jobId }}>
										<Button variant='primary'>
											{t('jobOverview.openPipeline')} <ArrowRight size={12} />
										</Button>
									</Link>
								)}
							</div>
						</Card>

						{perguntas > 0 && (
							<Card title={t('jobOverview.scriptTitle')}>
								<ol className='flex flex-col divide-y divide-border-soft'>
									{job?.jobQuestions?.slice(0, 8).map((q, i) => (
										<li key={i} className='flex gap-2.5 py-2 text-[12.5px] leading-snug'>
											<span className='shrink-0 font-mono text-[10.5px] text-lime-fg'>{String(i + 1).padStart(2, '0')}</span>
											<span className='min-w-0 text-text-2'>{q.question}</span>
										</li>
									))}
								</ol>
								{perguntas > 8 && (
									<p className='mt-2 text-[12px] text-muted'>{t('jobOverview.moreQuestions', { count: perguntas - 8 })}</p>
								)}
							</Card>
						)}
					</div>
				</div>
			</div>
		</Page>
	)
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
	return (
		<div className='flex items-baseline justify-between gap-3 border-b border-border-soft py-1.5'>
			<dt className='shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted'>{rotulo}</dt>
			<dd className='min-w-0 truncate text-right font-semibold'>{valor?.trim() ? valor : '—'}</dd>
		</div>
	)
}
