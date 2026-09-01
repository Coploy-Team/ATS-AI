import { Link, useNavigate } from '@tanstack/react-router'
import { Check, ClipboardList, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { MoneyInput } from '@/ui/money-input'
import { Banner, Card, Page } from '@/ui/page'
import { SkeletonCard } from '@/ui/skeleton'

/**
 * Requisição de vaga.
 *
 * ## Por que esta tela existe
 *
 * Em empresa média ninguém publica vaga sozinho: o gestor **pede**, o RH ou a
 * diretoria **aprova**, e só então a vaga vai ao ar. Isso hoje acontece em
 * e-mail e planilha — ou seja, o processo começa fora da Coploy e a gente só
 * entra quando a decisão já foi tomada em outro lugar. É o primeiro passo do
 * recrutamento, e era o passo que faltava.
 *
 * O backend estava pronto há semanas (`/companies/requisitions`, três rotas) e
 * não tinha tela nenhuma. Pior: o `linkJob` do service — o que transforma uma
 * requisição aprovada em vaga — **nunca era chamado por ninguém**. "Aprovada"
 * era um selo sem consequência.
 *
 * ## A tela é opt-in
 *
 * Empresa sem a flag `jobRequisition` continua criando vaga em um clique; a
 * tela então funciona como registro de pedidos, sem travar nada. Burocracia
 * que a empresa pequena não pediu é burocracia que faz ela desistir do produto.
 */
type Status = 'draft' | 'pending' | 'approved' | 'rejected'

interface Requisition {
	id: string
	title: string
	area?: string | null
	reason?: string | null
	headcount: number
	salaryRangeMin?: number | null
	salaryRangeMax?: number | null
	currency?: string | null
	requestedByName?: string | null
	status: Status
	decidedByName?: string | null
	decisionNote?: string | null
	jobId?: string | null
	/** Contratados na vaga ligada — derivado no servidor a cada leitura. */
	hiredCount?: number | null
	/** Contratações atingiram o headcount pedido. */
	fulfilled?: boolean
	createdAt: string
}

const TONE: Record<Status, string> = {
	draft: 'bg-card-alt text-text-2',
	pending: 'bg-amber-soft text-amber',
	approved: 'bg-lime-soft text-lime-fg',
	rejected: 'bg-danger-soft text-danger',
}

/** Ordem de trabalho: o que espera decisão primeiro, o resolvido por último. */
const ORDER: Record<Status, number> = { pending: 0, approved: 1, draft: 2, rejected: 3 }

function money(minor: number | null | undefined, currency: string, language: string) {
	if (minor === null || minor === undefined) return null
	return new Intl.NumberFormat(language, { style: 'currency', currency }).format(minor / 100)
}

export function RequisitionsPage() {
	const { t, i18n } = useTranslation()
	const navigate = useNavigate()
	const { can } = useCapabilities()

	const { data, isLoading, refetch } = empresa.useGetCompaniesRequisitions()
	const create = empresa.usePostCompaniesRequisitions()
	const decide = empresa.usePatchCompaniesRequisitionsRequisitionId()

	const payload = data?.data as
		| { requisitions?: Requisition[]; required?: boolean }
		| undefined
	const required = payload?.required === true

	const rows = useMemo(
		() =>
			[...(payload?.requisitions ?? [])].sort(
				(a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9),
			),
		[payload],
	)

	const [open, setOpen] = useState(false)
	const [title, setTitle] = useState('')
	const [area, setArea] = useState('')
	const [reason, setReason] = useState('')
	const [headcount, setHeadcount] = useState('1')
	const [salaryMin, setSalaryMin] = useState<number | null>(null)
	const [salaryMax, setSalaryMax] = useState<number | null>(null)
	const [error, setError] = useState<string | null>(null)

	async function submit() {
		setError(null)
		try {
			await create.mutateAsync({
				data: {
					title: title.trim(),
					area: area.trim() || null,
					reason: reason.trim() || null,
					headcount: Math.max(1, Number(headcount) || 1),
					salaryRangeMin: salaryMin,
					salaryRangeMax: salaryMax,
					currency: 'BRL',
				},
			})
			await refetch()
			setOpen(false)
			setTitle('')
			setArea('')
			setReason('')
			setHeadcount('1')
			setSalaryMin(null)
			setSalaryMax(null)
		} catch {
			setError(t('requisitions.createFailed'))
		}
	}

	async function judge(requisitionId: string, decision: 'approved' | 'rejected') {
		await decide.mutateAsync({ requisitionId, data: { decision } })
		await refetch()
	}

	const pending = rows.filter((row) => row.status === 'pending').length

	return (
		<Page
			title={t('requisitions.title')}
			subtitle={t('requisitions.subtitle')}
			actions={
				<Button onClick={() => setOpen((current) => !current)}>
					<Plus size={13} /> {t('requisitions.new')}
				</Button>
			}
		>
			<div className='flex flex-col gap-4'>
				{/*
				 * Dizer em que regime a empresa está. Sem isso, "aprovada" parece um
				 * selo decorativo em quem não tem a exigência ligada — e uma trava
				 * inexplicável em quem tem.
				 */}
				<Banner tone={required ? 'accent' : 'warning'} icon={<ClipboardList size={14} />}>
					{t(required ? 'requisitions.modeRequired' : 'requisitions.modeOptional')}
				</Banner>

				{open && (
					<Card title={t('requisitions.new')} description={t('requisitions.newHint')}>
						<div className='grid gap-3 sm:grid-cols-2'>
							<Labelled label={t('requisitions.jobTitle')}>
								<input
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									placeholder={t('requisitions.jobTitlePlaceholder')}
									className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								/>
							</Labelled>
							<Labelled label={t('requisitions.area')}>
								<input
									value={area}
									onChange={(event) => setArea(event.target.value)}
									placeholder={t('requisitions.areaPlaceholder')}
									className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								/>
							</Labelled>
							<Labelled label={t('requisitions.headcount')}>
								<input
									type='number'
									min={1}
									value={headcount}
									onChange={(event) => setHeadcount(event.target.value)}
									className='font-num h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								/>
							</Labelled>
							<Labelled label={t('requisitions.salaryRange')}>
								<div className='flex items-center gap-2'>
									<MoneyInput
										valueMinor={salaryMin}
										onChange={setSalaryMin}
										placeholder={t('requisitions.salaryMin')}
										aria-label={t('requisitions.salaryMin')}
										className='w-full'
									/>
									<span className='text-[12px] text-muted'>—</span>
									<MoneyInput
										valueMinor={salaryMax}
										onChange={setSalaryMax}
										placeholder={t('requisitions.salaryMax')}
										aria-label={t('requisitions.salaryMax')}
										className='w-full'
									/>
								</div>
							</Labelled>
							<div className='sm:col-span-2'>
								<Labelled label={t('requisitions.reason')} hint={t('requisitions.reasonHint')}>
									<textarea
										value={reason}
										onChange={(event) => setReason(event.target.value)}
										rows={3}
										className='w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px]'
									/>
								</Labelled>
							</div>
						</div>

						{error && <p className='mt-2 text-[12px] text-danger'>{error}</p>}

						<div className='mt-3 flex gap-2'>
							<Button onClick={() => void submit()} disabled={!title.trim() || create.isPending}>
								{create.isPending ? t('requisitions.sending') : t('requisitions.send')}
							</Button>
							<Button variant='secondary' onClick={() => setOpen(false)}>
								{t('filters.cancel')}
							</Button>
						</div>
					</Card>
				)}

				{isLoading && <SkeletonCard lines={4} />}

				{!isLoading && rows.length === 0 && (
					<div className='rounded-xl border border-border bg-card px-4 py-16 text-center'>
						<ClipboardList size={20} className='mx-auto mb-2 text-muted' />
						<p className='text-[13px] font-medium'>{t('requisitions.emptyTitle')}</p>
						<p className='mt-0.5 text-[12px] text-muted'>{t('requisitions.emptyHint')}</p>
					</div>
				)}

				{rows.length > 0 && (
					<div className='overflow-hidden rounded-xl border border-border bg-card'>
						<header className='flex items-center gap-2 border-b border-border-soft px-4 py-2.5'>
							<h2 className='flex-1 text-[13px] font-medium'>{t('requisitions.listTitle')}</h2>
							{pending > 0 && (
								<span className='rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-medium text-amber'>
									{t('requisitions.pendingCount', { count: pending })}
								</span>
							)}
						</header>

						{rows.map((row) => {
							const min = money(row.salaryRangeMin, row.currency || 'BRL', i18n.language)
							const max = money(row.salaryRangeMax, row.currency || 'BRL', i18n.language)
							return (
								<div
									key={row.id}
									className='flex flex-wrap items-start gap-3 border-b border-border-soft px-4 py-3 last:border-0'
								>
									<div className='min-w-0 flex-1'>
										<div className='flex flex-wrap items-center gap-2'>
											<span className='text-[13px] font-medium'>{row.title}</span>
											<span
												className={cn(
													'rounded-full px-2 py-0.5 text-[11px] font-medium',
													TONE[row.status],
												)}
											>
												{t(`requisitions.status.${row.status}`)}
											</span>
											{/*
											 * Com vaga ligada, o número que importa é o PROGRESSO
											 * (contratados × pedido) — derivado do pipeline a cada
											 * leitura, então desfazer uma contratação volta o contador.
											 */}
											{row.jobId && row.hiredCount !== null && row.hiredCount !== undefined ? (
												<span
													className={cn(
														'font-num rounded-full px-2 py-0.5 text-[11px] font-medium',
														row.fulfilled
															? 'bg-lime-soft text-lime-fg'
															: 'bg-card-alt text-text-2',
													)}
												>
													{t('requisitions.filled', {
														hired: row.hiredCount,
														total: row.headcount,
													})}
												</span>
											) : (
												row.headcount > 1 && (
													<span className='font-num text-[11.5px] text-muted'>
														{t('requisitions.positions', { count: row.headcount })}
													</span>
												)
											)}
											{row.fulfilled && (
												<span className='rounded-full bg-lime-soft px-2 py-0.5 text-[11px] font-medium text-lime-fg'>
													{t('requisitions.fulfilled')}
												</span>
											)}
										</div>

										<p className='mt-0.5 text-[11.5px] text-muted'>
											{[
												row.area,
												row.requestedByName
													? t('requisitions.requestedBy', { name: row.requestedByName })
													: null,
												min && max ? `${min} – ${max}` : min || max,
											]
												.filter(Boolean)
												.join(' · ')}
										</p>

										{row.reason && (
											<p className='mt-1 text-[12px] leading-snug text-text-2'>{row.reason}</p>
										)}

										{row.decisionNote && (
											<p className='mt-1 text-[11.5px] text-muted'>
												{t('requisitions.decidedBy', { name: row.decidedByName ?? '—' })}:{' '}
												{row.decisionNote}
											</p>
										)}
									</div>

									<div className='flex shrink-0 flex-wrap items-center gap-2'>
										{/*
										 * Aprovar é decisão de orçamento: fica sob `settings:write`, o
										 * mesmo nível de quem mexe na conta — não de quem opera vaga.
										 */}
										{row.status === 'pending' && can('settings:write') && (
											<>
												<Button
													variant='secondary'
													size='sm'
													onClick={() => void judge(row.id, 'rejected')}
													disabled={decide.isPending}
												>
													<X size={12} /> {t('requisitions.reject')}
												</Button>
												<Button
													size='sm'
													onClick={() => void judge(row.id, 'approved')}
													disabled={decide.isPending}
												>
													<Check size={12} /> {t('requisitions.approve')}
												</Button>
											</>
										)}

										{/*
										 * O elo que faltava: aprovada vira vaga, uma única vez. O
										 * `requisitionId` viaja na URL e o formulário de vaga o envia
										 * na criação, que é onde o servidor marca a requisição como
										 * consumida.
										 */}
										{row.status === 'approved' && !row.jobId && can('job:write') && (
											<Button
												size='sm'
												onClick={() =>
													navigate({
														to: '/vagas/nova',
														search: { requisicao: row.id, titulo: row.title } as never,
													})
												}
											>
												{t('requisitions.createJob')}
											</Button>
										)}

										{row.fulfilled && row.jobId && (
											<Link
												to='/vagas/$jobId/configuracao'
												params={{ jobId: row.jobId as string }}
												className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
											>
												{t('requisitions.closeJobHint')}
											</Link>
										)}
										{row.jobId && (
											<Button
												variant='secondary'
												size='sm'
												onClick={() =>
													navigate({
														to: '/vagas/$jobId/pipeline',
														params: { jobId: row.jobId as string },
													})
												}
											>
												{t('requisitions.openJob')}
											</Button>
										)}
									</div>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</Page>
	)
}

/** Rótulo fixo: placeholder some ao digitar e o campo deixa de se explicar. */
function Labelled({
	label,
	hint,
	children,
}: {
	label: string
	hint?: string
	children: React.ReactNode
}) {
	return (
		<label className='flex flex-col gap-1'>
			<span className='text-[11.5px] font-medium text-text-2'>
				{label}
				{hint && <span className='ml-1 font-normal text-muted'>{hint}</span>}
			</span>
			{children}
		</label>
	)
}
