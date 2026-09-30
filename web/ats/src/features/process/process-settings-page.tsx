import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Globe, Mail, Pencil, Plus, Trash2, X } from 'lucide-react'

import { empresa } from '@coploy/sdk/react'

import { CANONICAL_STAGES, stageFill, stageLabel } from '@/features/jobs/stages'
import { StageActionsSection } from '@/features/settings/stage-actions-section'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { stagger } from '@/lib/motion'
import { Button } from '@/ui/button'
import { Card, Page } from '@/ui/page'
import { Skeleton } from '@/ui/skeleton'

type Coluna = { id: string; label: string; color: string }
type Motivo = {
	code: string
	label: string
	requiresNote?: boolean
	requiresEvidence?: boolean
	candidateVisibility: 'hidden' | 'generic' | 'specific'
}

/**
 * Como o processo da EMPRESA se comporta.
 *
 * ⚠️ Não confundir com a aba Processo da vaga: lá ficam as etapas e o prazo
 * DAQUELA vaga; aqui fica o que vale para todas — as etapas do funil (as da
 * casa e as que a empresa cria), o que cada etapa dispara, os motivos de
 * reprovação e o que o candidato vê em cada um.
 *
 * Antes esta tela era só a grade de ações — "pobre", nas palavras do
 * Henrique. Tudo o que entrou aqui já existia na API sem tela.
 */
export function ProcessSettingsPage() {
	const { t } = useTranslation()
	const { can } = useCapabilities()
	const editable = can('settings:write')

	const colunas = empresa.useGetCompaniesKanbanColumns()
	const criar = empresa.usePostCompaniesKanbanColumns()
	const renomear = empresa.usePatchCompaniesKanbanColumnsColumnId()
	const apagar = empresa.useDeleteCompaniesKanbanColumnsColumnId()
	const motivos = empresa.useGetCompaniesRejectionReasons()

	const custom = ((colunas.data?.data as { columns?: Coluna[] } | undefined)?.columns ?? []).filter(
		(c) => !(CANONICAL_STAGES as readonly string[]).includes(c.id),
	)
	const reasons = ((motivos.data?.data as { reasons?: Motivo[] } | undefined)?.reasons ?? []) as Motivo[]

	const [novo, setNovo] = useState('')
	const [editando, setEditando] = useState<{ id: string; label: string } | null>(null)
	const [erro, setErro] = useState(false)

	async function adicionar() {
		const label = novo.trim()
		if (!label) return
		setErro(false)
		try {
			// cor: sempre no matiz da casa — etapa própria não ganha outra cor
			await criar.mutateAsync({ data: { label, color: '#cdfb12' } as never })
			setNovo('')
			await colunas.refetch()
		} catch {
			setErro(true)
		}
	}
	async function salvarNome() {
		if (!editando || !editando.label.trim()) return
		setErro(false)
		try {
			await renomear.mutateAsync({ columnId: editando.id, data: { label: editando.label.trim() } as never })
			setEditando(null)
			await colunas.refetch()
		} catch {
			setErro(true)
		}
	}
	async function remover(id: string) {
		setErro(false)
		try {
			await apagar.mutateAsync({ columnId: id })
			await colunas.refetch()
		} catch {
			setErro(true)
		}
	}

	return (
		<Page title={t('processSettings.title')} subtitle={t('processSettings.subtitle')}>
			<div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
				<div className='flex min-w-0 flex-col gap-4'>
					{/* o funil: a régua da casa, explicada etapa a etapa */}
					<Card title={t('processSettings.stagesTitle')} description={t('processSettings.stagesHint')}>
						<div className='flex gap-1.5'>
							{CANONICAL_STAGES.map((key, i) => (
								<span
									key={key}
									style={stagger(i, 70, 420)}
									className={cn('fill h-[7px] flex-1 rounded-full', stageFill(key))}
								/>
							))}
						</div>
						<ol className='mt-4 grid gap-x-6 gap-y-3 md:grid-cols-2'>
							{CANONICAL_STAGES.map((key, i) => (
								<li key={key} style={stagger(i)} className='rise flex gap-3'>
									<span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', stageFill(key))} />
									<div className='min-w-0'>
										<p className='text-[13.5px] font-semibold'>{stageLabel(key, t)}</p>
										<p className='text-[12.5px] leading-snug text-text-2'>{t(`processSettings.stageMeaning.${key}`)}</p>
									</div>
								</li>
							))}
						</ol>

						<div className='mt-5 border-t border-border-soft pt-4'>
							<p className='font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>{t('processSettings.customTitle')}</p>
							<p className='mt-1 text-[12.5px] text-text-2'>{t('processSettings.customHint')}</p>
							{colunas.isLoading ? (
								<Skeleton className='mt-3 h-10 w-full' />
							) : (
								<ul className='mt-3 flex flex-col gap-1.5'>
									{custom.length === 0 && (
										<li className='rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted'>
											{t('processSettings.customEmpty')}
										</li>
									)}
									{custom.map((c) => (
										<li key={c.id} className='flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2'>
											<span className='h-2 w-2 shrink-0 rounded-full bg-lime/70' />
											{editando?.id === c.id ? (
												<>
													<input
														autoFocus
														value={editando.label}
														onChange={(e) => setEditando({ id: c.id, label: e.target.value })}
														onKeyDown={(e) => {
															if (e.key === 'Enter') void salvarNome()
															if (e.key === 'Escape') setEditando(null)
														}}
														className='h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-[13px] text-text'
													/>
													<button onClick={() => void salvarNome()} className='text-lime-fg' aria-label={t('jobConfig.save')}>
														<Check size={14} />
													</button>
													<button onClick={() => setEditando(null)} className='text-muted' aria-label={t('jobForm.agent.close')}>
														<X size={14} />
													</button>
												</>
											) : (
												<>
													<span className='min-w-0 flex-1 truncate text-[13.5px]'>{c.label}</span>
													{editable && (
														<>
															<button
																onClick={() => setEditando({ id: c.id, label: c.label })}
																className='text-muted transition-colors hover:text-text'
																aria-label={t('processSettings.rename')}
															>
																<Pencil size={13} />
															</button>
															<button
																onClick={() => void remover(c.id)}
																className='text-muted transition-colors hover:text-danger'
																aria-label={t('processSettings.remove')}
															>
																<Trash2 size={13} />
															</button>
														</>
													)}
												</>
											)}
										</li>
									))}
								</ul>
							)}
							{editable && (
								<div className='mt-3 flex flex-wrap items-center gap-2'>
									<input
										value={novo}
										onChange={(e) => setNovo(e.target.value)}
										onKeyDown={(e) => e.key === 'Enter' && void adicionar()}
										placeholder={t('processSettings.customPlaceholder')}
										className='h-8 min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
									/>
									<Button variant='secondary' size='md' disabled={!novo.trim() || criar.isPending} onClick={() => void adicionar()}>
										<Plus size={13} /> {t('processSettings.addColumn')}
									</Button>
								</div>
							)}
							{erro && <p className='mt-2 text-[12px] text-danger'>{t('jobConfig.saveError')}</p>}
						</div>
					</Card>

					<StageActionsSection />
				</div>

				<div className='flex flex-col gap-4 xl:sticky xl:top-0 xl:self-start'>
					{/* motivos de reprovação: o vocabulário e o que o candidato vê */}
					<Card title={t('processSettings.reasonsTitle')} description={t('processSettings.reasonsHint')}>
						{motivos.isLoading ? (
							<Skeleton className='h-32 w-full' />
						) : (
							<ul className='flex flex-col divide-y divide-border-soft'>
								{reasons.map((r) => (
									<li key={r.code} className='flex items-start justify-between gap-3 py-2'>
										<div className='min-w-0'>
											<p className='text-[13px] font-medium'>{t(`reject.templates.${r.code}`, { defaultValue: r.label })}</p>
											{(r.requiresNote || r.requiresEvidence) && (
												<p className='text-[11.5px] text-muted'>
													{[r.requiresNote && t('processSettings.requiresNote'), r.requiresEvidence && t('processSettings.requiresEvidence')]
														.filter(Boolean)
														.join(' · ')}
												</p>
											)}
										</div>
										<span
											className={cn(
												'shrink-0 rounded-md px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em]',
												r.candidateVisibility === 'specific'
													? 'bg-lime-soft text-lime-fg'
													: r.candidateVisibility === 'generic'
														? 'bg-card-alt text-text-2'
														: 'border border-border text-muted',
											)}
										>
											{t(`processSettings.visibility.${r.candidateVisibility}`)}
										</span>
									</li>
								))}
							</ul>
						)}
					</Card>

					<Card title={t('processSettings.linksTitle')}>
						<div className='flex flex-col gap-2'>
							<Link to='/comunicacao' className='flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-lime-mid'>
								<Mail size={15} className='shrink-0 text-lime-fg' />
								<span className='min-w-0 flex-1'>
									<span className='block text-[13px] font-medium'>{t('processSettings.emailsLink')}</span>
									<span className='block text-[12px] text-muted'>{t('processSettings.emailsHint')}</span>
								</span>
								<ArrowRight size={13} className='text-muted' />
							</Link>
							<Link to='/portal-de-vagas' className='flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-lime-mid'>
								<Globe size={15} className='shrink-0 text-lime-fg' />
								<span className='min-w-0 flex-1'>
									<span className='block text-[13px] font-medium'>{t('processSettings.portalLink')}</span>
									<span className='block text-[12px] text-muted'>{t('processSettings.portalHint')}</span>
								</span>
								<ArrowRight size={13} className='text-muted' />
							</Link>
						</div>
					</Card>
				</div>
			</div>
		</Page>
	)
}
