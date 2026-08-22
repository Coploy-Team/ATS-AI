import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Check, GripVertical, Kanban, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { stageFill } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card as Section, Page } from '@/ui/page'
import { SkeletonCard } from '@/ui/skeleton'

import { AdoptionProgress } from './adoption-progress'
import { JobCandidatesSection } from './job-candidates-section'
import { KnockoutSection } from './knockout-section'
import { HiringIntentSection } from './hiring-intent-section'
import { SlaSection } from './sla-section'

/**
 * Configuração da vaga — tela que nunca existiu no dashboard.
 *
 * A configuração vivia espalhada: SLA em lugar nenhum, colunas do kanban num
 * modal dentro do board, pausar vaga no menu da lista. Juntar tudo aqui é o
 * que permite a regra de adoção (§7) ter um lugar pra apontar — e o
 * "progresso de adoção" só faz sentido se as configurações moram juntas.
 */
interface JobConfigView {
	jobName?: string
	identifier?: string | null
	public?: boolean | null
	stopped?: boolean | null
	feedbackSlaHours?: number | null
	antiGhostingEnabled?: boolean | null
	hiringIntent?: string | null
	freshnessSlaDays?: number | null
	slaIrregularSince?: string | null
}

export function JobConfigPage() {
	const { t } = useTranslation()
	const { jobId } = useParams({ from: '/app/vagas/$jobId/configuracao' })
	const queryClient = useQueryClient()

	// o detalhe da vaga vem por slug/id na mesma rota; o payload é passthrough,
	// então os campos de configuração chegam como `unknown` e viram tipo aqui
	const { data: jobData, isLoading } = empresa.useGetCompaniesJobsSlug(jobId)
	const job = jobData?.data as JobConfigView | undefined

	const { data: configData } = empresa.useGetCompaniesJobsJobIdKanbanConfig(jobId, {
		query: { enabled: Boolean(jobId) },
	})
	const config = configData?.data.kanbanConfig

	const { data: knockoutData } = empresa.useGetCompaniesJobsJobIdKnockout(jobId, {
		query: { enabled: Boolean(jobId) },
	})
	const knockout = knockoutData?.data

	return (
		<Page
			title={t('jobConfig.title')}
			subtitle={
				<>
					<Link to='/vagas' className='text-muted transition-colors hover:text-text'>
						{t('jobConfig.backToJobs')}
					</Link>
					<span className='mx-1.5 text-muted'>/</span>
					{isLoading ? t('jobs.loading') : job?.jobName}
					{job?.identifier && <span className='font-num text-muted'> · {job.identifier}</span>}
				</>
			}
			actions={
				<>
					{/* atalho pro board da vaga: configurar e operar são o mesmo trabalho */}
					<Link
						to='/pipeline'
						search={{ vaga: jobId }}
						className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
					>
						<Kanban size={13} /> {t('jobConfig.openPipeline')}
					</Link>
					<Link
						to='/vagas/$jobId/editar'
						params={{ jobId }}
						className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
					>
						<Pencil size={13} /> {t('jobConfig.editContent')}
					</Link>
				</>
			}
		>
			{/* duas colunas: o progresso de adoção fica visível enquanto a pessoa
			    configura, em vez de sumir com o scroll */}
			<div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]'>
				{/*
				 * Enquanto a vaga carrega, as seções montavam vazias e iam se
				 * preenchendo uma a uma — a tela pulava três vezes. O esqueleto ocupa
				 * o lugar delas de uma vez.
				 */}
				{isLoading ? (
					<div className='flex min-w-0 flex-col gap-4'>
						<SkeletonCard lines={3} />
						<SkeletonCard lines={2} />
						<SkeletonCard lines={4} />
					</div>
				) : (
				<div className='flex min-w-0 flex-col gap-4'>
					<JobCandidatesSection jobId={jobId} />
					<SlaSection jobId={jobId} job={job} />
					{/* logo após o SLA: as duas declarações formam o selo de vaga verificada */}
					<HiringIntentSection jobId={jobId} job={job} />
					<StagesSection
						jobId={jobId}
						config={config}
						onSaved={() => queryClient.invalidateQueries()}
					/>
					<KnockoutSection jobId={jobId} />
					<VisibilitySection jobId={jobId} job={job} />
				</div>
				)}

				<div className='xl:sticky xl:top-0 xl:self-start'>
					<AdoptionProgress
						items={[
							{ key: 'stages', done: config?.isDefault === false },
							{ key: 'sla', done: Boolean(job?.feedbackSlaHours) },
							{ key: 'intent', done: Boolean(job?.hiringIntent) },
							{ key: 'knockout', done: knockout?.configured === true },
							{ key: 'public', done: job?.public === true },
						]}
					/>
				</div>
			</div>
		</Page>
	)
}

type StageRow = { id: string; order: number; label: string; canonical: boolean }

/**
 * Régua de etapas da vaga.
 *
 * Reordenar é por botão, não por drag: são 5–8 linhas numa tela de
 * configuração que se mexe uma vez por vaga — drag aqui custa acessibilidade
 * sem devolver velocidade.
 */
function StagesSection({
	jobId,
	config,
	onSaved,
}: {
	jobId: string
	config?: {
		isDefault: boolean
		stages: Array<{ id: string; order: number; label: string; canonical: boolean }>
	}
	onSaved: () => void
}) {
	const { t } = useTranslation()
	const save = empresa.usePutCompaniesJobsJobIdKanbanConfig()
	const createColumn = empresa.usePostCompaniesKanbanColumns()

	const serverStages = useMemo(
		() => config?.stages.map((s) => ({ ...s })) ?? [],
		[config],
	)
	const [rows, setRows] = useState<StageRow[]>(serverStages)
	const [newLabel, setNewLabel] = useState('')
	const [saved, setSaved] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => setRows(serverStages), [serverStages])

	const dirty = useMemo(
		() => JSON.stringify(rows.map((r) => r.id)) !== JSON.stringify(serverStages.map((r) => r.id)),
		[rows, serverStages],
	)

	function moveRow(index: number, delta: number) {
		const target = index + delta
		if (target < 0 || target >= rows.length) return
		const next = [...rows]
		;[next[index], next[target]] = [next[target], next[index]]
		setRows(next.map((row, i) => ({ ...row, order: i })))
	}

	/*
	 * Processo mínimo = candidatura → entrevista → decisão. Tudo além disso é
	 * escolha explícita do recrutador, e a tela precisa dizer o preço.
	 */
	const extraStages = rows.filter((row) => !row.canonical).length

	async function addColumn() {
		const label = newLabel.trim()
		if (!label) return
		setError(null)
		try {
			const created = await createColumn.mutateAsync({
				data: { label, color: '#2bd9d2' },
			})
			const id = created.data.column.id
			// entra antes das terminais: etapa nova é passo de processo, não desfecho
			const insertAt = Math.max(rows.findIndex((r) => r.id === 'approved'), 1)
			const next = [...rows]
			next.splice(insertAt, 0, { id, order: 0, label, canonical: false })
			setRows(next.map((row, i) => ({ ...row, order: i })))
			setNewLabel('')
		} catch {
			setError(t('jobConfig.stagesAddError'))
		}
	}

	async function persist() {
		setError(null)
		setSaved(false)
		try {
			await save.mutateAsync({
				jobId,
				data: { columns: rows.map((row, i) => ({ id: row.id, order: i })) },
			})
			setSaved(true)
			onSaved()
		} catch {
			setError(t('jobConfig.stagesSaveError'))
		}
	}

	return (
		<Section title={t('jobConfig.stagesTitle')} description={t('jobConfig.stagesDescription')}>
			{config?.isDefault && (
				<p className='mb-3 rounded-lg border border-lime-mid bg-lime-soft px-3 py-2 text-[12px] text-text'>
					{t('jobConfig.stagesDefaultNotice')}
				</p>
			)}

			<ul className='flex flex-col gap-1.5'>
				{rows.map((row, index) => (
					<li
						key={row.id}
						className='flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2'
					>
						<span className='font-num w-5 text-[11px] text-muted'>{index + 1}</span>
						<span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stageFill(row.id))} />
						<span className='min-w-0 flex-1 truncate text-[12.5px]'>{row.label}</span>
						{!row.canonical && (
							<span className='rounded bg-card-alt px-1.5 py-0.5 text-[10px] text-text-2'>
								{t('jobConfig.stageCustom')}
							</span>
						)}
						<div className='flex items-center gap-0.5'>
							<button
								onClick={() => moveRow(index, -1)}
								disabled={index === 0}
								aria-label={t('jobConfig.stageUp')}
								className='rounded p-1 text-muted transition-colors hover:text-text disabled:opacity-30'
							>
								<GripVertical size={12} className='rotate-90' />
							</button>
							{!row.canonical && (
								<button
									onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
									aria-label={t('jobConfig.stageRemove')}
									className='rounded p-1 text-muted transition-colors hover:text-danger'
								>
									<Trash2 size={12} />
								</button>
							)}
						</div>
					</li>
				))}
			</ul>

			{/*
			 * Aviso de impacto (V2-606).
			 *
			 * Etapa a mais não é neutra: cada passo extra é mais uma espera para o
			 * candidato, e abandono é a dor nº1 registrada na pesquisa. O aviso
			 * aparece quando o processo passa do mínimo — não bloqueia, porque
			 * processo longo às vezes é necessário; só deixa de ser gratuito.
			 */}
			{extraStages > 0 && (
				<p className='mt-3 rounded-lg border border-border bg-card-alt px-3 py-2 text-[12px] text-text-2'>
					{t('jobConfig.stagesImpact', { count: extraStages })}
				</p>
			)}

			<div className='mt-3 flex flex-wrap items-center gap-2'>
				<input
					value={newLabel}
					onChange={(e) => setNewLabel(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && void addColumn()}
					placeholder={t('jobConfig.stageNewPlaceholder')}
					className='h-8 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text placeholder:text-muted'
				/>
				<Button
					variant='secondary'
					size='sm'
					onClick={() => void addColumn()}
					disabled={!newLabel.trim() || createColumn.isPending}
				>
					<Plus size={12} /> {t('jobConfig.stageAdd')}
				</Button>
			</div>

			{error && <p className='mt-2 text-[12px] text-danger'>{error}</p>}

			<div className='mt-4 flex items-center gap-2'>
				<Button onClick={() => void persist()} disabled={!dirty || save.isPending}>
					{save.isPending ? t('jobConfig.saving') : t('jobConfig.save')}
				</Button>
				{saved && !dirty && (
					<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
						<Check size={13} /> {t('jobConfig.saved')}
					</span>
				)}
			</div>
		</Section>
	)
}

function VisibilitySection({
	jobId,
	job,
}: {
	jobId: string
	job?: { public?: boolean | null; stopped?: boolean | null }
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const patch = empresa.usePatchCompaniesJobsJobId()
	const [error, setError] = useState(false)

	async function update(data: Record<string, unknown>) {
		setError(false)
		try {
			await patch.mutateAsync({ jobId, data: data as never })
			await queryClient.invalidateQueries()
		} catch {
			setError(true)
		}
	}

	return (
		<Section
			title={t('jobConfig.visibilityTitle')}
			description={t('jobConfig.visibilityDescription')}
		>
			<div className='flex flex-col gap-2'>
				<Toggle
					checked={job?.public === true}
					onChange={(value) => void update({ public: value })}
					disabled={patch.isPending}
					label={t('jobConfig.publicLabel')}
					hint={t('jobConfig.publicHint')}
				/>
				<Toggle
					// pausar é o oposto de "aberta": inverter aqui evita rótulo negativo
					checked={job?.stopped !== true}
					onChange={(value) => void update({ stopped: !value })}
					disabled={patch.isPending}
					label={t('jobConfig.openLabel')}
					hint={t('jobConfig.openHint')}
				/>
			</div>
			{error && <p className='mt-2 text-[12px] text-danger'>{t('jobConfig.saveError')}</p>}
		</Section>
	)
}

export function Toggle({
	checked,
	onChange,
	label,
	hint,
	disabled,
}: {
	checked: boolean
	onChange: (value: boolean) => void
	label: string
	hint: string
	disabled?: boolean
}) {
	return (
		<label className='flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5'>
			<input
				type='checkbox'
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange(e.target.checked)}
				className='mt-0.5 h-3.5 w-3.5 accent-[var(--lime)]'
			/>
			<span className='min-w-0'>
				<span className='block text-[12.5px] font-medium'>{label}</span>
				<span className='block text-[11.5px] text-text-2'>{hint}</span>
			</span>
		</label>
	)
}
