import {
	Archive,
	ArrowDown,
	ArrowUp,
	Download,
	Globe,
	Lock,
	Plus,
	RefreshCw,
	Search,
} from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { SlaCell } from '@/components/sla-cell'
import { StageBars, StageLegend } from '@/components/stage-bars'
import { StatusBadge } from '@/components/status-badge'
import { cn } from '@/lib/cn'
import { useCapabilities } from '@/lib/capabilities'
import { Button } from '@/ui/button'
import { FilterPill } from '@/ui/filter-pill'
import { IconToggle, Segmented, ToggleChip } from '@/ui/segmented'
import { Pagination } from '@/ui/pagination'
import { Tooltip } from '@/ui/tooltip'

import {
	ActiveFilterChips,
	AdvancedFilters,
	countActive,
	EMPTY_ADVANCED,
	type AdvancedValues,
} from './advanced-filters'
import { downloadCsv, fetchAllJobsForExport, jobsToCsv } from './export-csv'
import { interviewTypeIcon, JobTypeAnchor } from './interview-type'
import { toJobRow, type JobRow } from './map'
import { LanguageFlag } from '@/ui/language-flag'
import { ViewToggle } from '@/ui/view-toggle'

type StatusFilter = 'all' | 'active' | 'inactive'
type SortBy = 'default' | 'name' | 'createdAt'
type SortDir = 'asc' | 'desc'
type ViewMode = 'table' | 'grid'

const PAGE_SIZE = 20
const VIEW_KEY = 'coploy.ats.jobs.view'

/** Mesma fonte de bandeiras do dashboard (flagcdn) — emoji renderiza feio no desktop. */
/** Referência da vaga: externa como veio; interna abreviada com # (o id do
 *  Firestore é longo demais pra caber, e o valor completo fica no title). */
function JobReference({ job, className }: { job: JobRow; className?: string }) {
	const text = job.referenceIsExternal ? job.reference : `#${job.reference.slice(0, 8)}`
	return (
		<span className={cn('font-num truncate text-[10px] text-muted', className)} title={job.reference}>
			{text}
		</span>
	)
}

/**
 * Metadados da vaga: TEXTO, não pills. Cinco badges de peso igual viravam
 * ruído (pesquisa: badge é pra exceção que precisa de atenção agora; tag de
 * categoria é metadado, e sistemas recomendam no máx. 2 pills empilhadas).
 * Aqui só sobra: 1 badge (Prioridade = a exceção), 2 ícones (tipo e
 * visibilidade) e uma linha de texto com nível · segmento · local.
 */
function JobMeta({ job, className }: { job: JobRow; className?: string }) {
	// tipo saiu daqui: virou o ícone da âncora (features/jobs/interview-type.tsx)
	const parts = [job.level, job.segment, job.location].filter(Boolean)
	if (parts.length === 0) return null
	return (
		<p className={cn('truncate text-[11px] text-muted', className)}>
			{parts.join(' · ')}
		</p>
	)
}

/** Visibilidade vira ícone: é estado binário, não merece pill. */
function VisibilityIcon({ isPublic }: { isPublic: boolean }) {
	const { t } = useTranslation()
	return (
		<Tooltip
			side='top'
			label={isPublic ? t('jobs.visibilityPublic') : t('jobs.visibilityPrivate')}
		>
			<span className='inline-flex shrink-0 text-muted'>
				{isPublic ? <Globe size={12} /> : <Lock size={12} />}
			</span>
		</Tooltip>
	)
}

export function JobsPage() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { can, features } = useCapabilities()
	const [status, setStatus] = useState<StatusFilter>('all')
	const [creatorId, setCreatorId] = useState('all')
	const [priority, setPriority] = useState('all')
	const [search, setSearch] = useState('')
	const [page, setPage] = useState(1)
	const [sortBy, setSortBy] = useState<SortBy>('default')
	const [sortDir, setSortDir] = useState<SortDir>('desc')
	const [view, setView] = useState<ViewMode>(
		() => (localStorage.getItem(VIEW_KEY) as ViewMode) || 'table',
	)
	const [types, setTypes] = useState<string[]>([])
	const [mode, setMode] = useState('all')
	const [showArchived, setShowArchived] = useState(false)
	const [advanced, setAdvanced] = useState<AdvancedValues>(EMPTY_ADVANCED)
	const [exporting, setExporting] = useState(false)
	const find = useDeferredValue(search)

	useEffect(() => {
		localStorage.setItem(VIEW_KEY, view)
	}, [view])

	// Filtro novo reinicia a paginação — senão a pessoa fica presa numa página
	// que não existe mais no resultado filtrado.
	useEffect(() => {
		setPage(1)
	}, [status, creatorId, priority, find, sortBy, sortDir, advanced, types, mode, showArchived])

	/*
	 * A lista de criadores é `team:read` — o recrutador não tem, e a chamada
	 * voltava 403 no console. Além disso o filtro não faz sentido para quem só
	 * enxerga as próprias vagas, e o seletor ainda mostraria o nome dos colegas.
	 */
	const podeFiltrarPorRecrutador = can('team:read')
	const { data: creatorsData } = empresa.useGetCompaniesCreators({
		query: { enabled: podeFiltrarPorRecrutador },
	})
	const creatorOptions = [
		{ value: 'all', label: t('jobs.optionAllMasc') },
		...(creatorsData?.data.creators.map((c) => ({ value: c.id, label: c.name })) ?? []),
	]

	/** Filtros que vão pra API (sem paginação) — reusados no export. */
	const filterParams = {
		status,
		...(priority !== 'all' ? { priority: priority as 'true' | 'false' } : {}),
		...(creatorId !== 'all' ? { creatorId } : {}),
		...(find.trim() ? { find: find.trim() } : {}),
		...(sortBy !== 'default' ? { sortBy, sortDir } : {}),
		...(types.length > 0 ? { interviewType: types.join(',') } : {}),
		/*
		 * MODO é como a entrevista acontece (vídeo, voz, WhatsApp) — não
		 * confundir com o TIPO (entrevista, avaliação, desligamento), que é o
		 * filtro dos ícones ao lado. São dois eixos e combinam entre si.
		 */
		...(mode !== 'all' ? { interviewMode: mode as 'video' } : {}),
		...(showArchived ? { showArchived: 'true' } : {}),
		...(advanced.language !== 'all' ? { language: advanced.language as 'pt' } : {}),
		...(advanced.segment !== 'all' ? { segment: advanced.segment as 'all' } : {}),
		...(advanced.level !== 'all' ? { level: advanced.level as 'all' } : {}),
		...(advanced.country ? { country: advanced.country } : {}),
		...(advanced.state ? { state: advanced.state } : {}),
		...(advanced.city ? { city: advanced.city } : {}),
	}

	/*
	 * "Nenhuma vaga ainda — crie a primeira" era mostrado sempre que a lista
	 * voltava vazia, inclusive quando havia FILTRO ativo: quem filtrasse por um
	 * tipo sem vaga era informado de que a empresa não tem vaga nenhuma, e o
	 * botão oferecido criava outra em vez de limpar o filtro. Só a busca por
	 * texto contava aqui — os outros filtros, não. (`showArchived` fica de fora
	 * de propósito: ele mostra MAIS, nunca esvazia a lista.)
	 */
	const temFiltroAtivo =
		Boolean(find.trim()) ||
		status !== 'all' ||
		types.length > 0 ||
		mode !== 'all' ||
		priority !== 'all' ||
		creatorId !== 'all' ||
		countActive(advanced) > 0

	const queryParams = {
		...filterParams,
		limit: String(PAGE_SIZE),
		page: String(page),
	}

	const { data, isLoading, isError, refetch, isFetching } =
		empresa.useGetCompaniesJobs(queryParams)

	const rows = data?.data.jobs.map(toJobRow) ?? []
	const pagination = data?.data.pagination
	const total = pagination?.total ?? rows.length
	const totalPages = pagination?.totalPages ?? 1
	const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
	const rangeEnd = (page - 1) * PAGE_SIZE + rows.length

	function toggleSort(field: Exclude<SortBy, 'default'>) {
		if (sortBy !== field) {
			setSortBy(field)
			setSortDir(field === 'name' ? 'asc' : 'desc')
			return
		}
		setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
	}

	async function handleExport() {
		setExporting(true)
		try {
			const all = await fetchAllJobsForExport(filterParams as Record<string, string>)
			const csv = jobsToCsv(all, {
				title: t('jobs.colJob'),
				meta: t('export.meta'),
				status: t('jobs.colStatus'),
				priority: t('jobs.filterPriority'),
				candidates: t('jobs.colCandidates'),
				stages: t('jobs.colStages'),
				openFor: t('export.openForDays'),
				sla: t('jobs.colSla'),
				creator: t('jobs.colCreator'),
				status_aberta: t('jobs.statusOpen'),
				status_pausada: t('jobs.statusPaused'),
				status_fechada: t('jobs.statusClosed'),
				slaBreached: t('jobs.slaBreachedShort'),
				yes: t('export.yes'),
				no: t('export.no'),
			})
			downloadCsv(csv, `coploy-vagas-${new Date().toISOString().slice(0, 10)}.csv`)
		} finally {
			setExporting(false)
		}
	}

	const SortHeader = ({
		field,
		label,
		align = 'left',
	}: {
		field: Exclude<SortBy, 'default'>
		label: string
		align?: 'left' | 'right'
	}) => (
		// a seta só existe quando a coluna É a ordenação ativa: o placeholder
		// invisível reservava largura e desalinhava esses headers dos demais
		<button
			onClick={() => toggleSort(field)}
			className={cn(
				'relative inline-flex items-center gap-1 uppercase tracking-wider transition-colors duration-150 hover:text-text',
				sortBy === field && 'text-text',
				align === 'right' && 'flex-row-reverse',
			)}
		>
			{label}
			{sortBy === field &&
				(sortDir === 'asc' ? (
					<ArrowUp size={11} className='text-lime-fg' />
				) : (
					<ArrowDown size={11} className='text-lime-fg' />
				))}
		</button>
	)

	return (
		/*
		 * Largura total, como as outras telas. `mx-auto max-w-[1600px]` deixava
		 * Vagas centralizada com faixas vazias dos lados enquanto Candidatos,
		 * Pipeline e Hunting ocupam a tela — em monitor largo a diferença fica
		 * evidente e parece outra aplicação.
		 */
		<div className='flex h-full flex-col p-6'>
			<div className='mb-4 flex flex-wrap items-end justify-between gap-3'>
				<div>
					<h1 className='text-[24px]'>{t('jobs.title')}</h1>
					<p className='mt-1 text-[13px] text-text-2'>
						{isLoading ? t('jobs.loading') : t('jobs.count', { count: total })}
					</p>
				</div>
				<div className='flex items-center gap-2'>
					<Button variant='secondary' onClick={handleExport} disabled={exporting || total === 0}>
						<Download size={13} /> {exporting ? t('export.running') : t('export.action')}
					</Button>
					{can('job:write') && (
					<Button
						variant='primary'
						className='shadow-[0_4px_16px_-4px_rgba(205,251,18,0.5)]'
						onClick={() => navigate({ to: '/vagas/nova' })}
					>
						<Plus size={14} /> {t('jobs.create')}
					</Button>
					)}
				</div>
			</div>

			<div className='mb-3 flex flex-wrap items-center gap-2'>
				<Segmented
					value={status}
					onChange={(v) => setStatus(v as StatusFilter)}
					options={[
						{ value: 'all', label: t('jobs.optionAll') },
						{ value: 'active', label: t('jobs.optionActive') },
						{ value: 'inactive', label: t('jobs.optionInactive') },
					]}
				/>

				{/* tipo aceita vários valores na API — toggles com o MESMO ícone que
				    marca o tipo na linha, então o filtro reforça o vocabulário
				    (com texto a barra ficava gigante) */}
				<div className='flex items-center gap-1'>
					{(['interview', 'evaluation', 'emotional', 'exitJob'] as const).map((type) => {
						const Icon = interviewTypeIcon(type)
						return (
							<IconToggle
								key={type}
								label={t(`interviewTypes.${type}`)}
								active={types.includes(type)}
								onClick={() =>
									setTypes((current) =>
										current.includes(type)
											? current.filter((v) => v !== type)
											: [...current, type],
									)
								}
							>
								{Icon && <Icon size={14} strokeWidth={1.75} />}
							</IconToggle>
						)
					})}
				</div>
				{/*
				 * Só onde os modos EXISTEM. Sem Motor a vaga não é entrevistável, e
				 * filtrar por um modo que ninguém executa é filtro decorativo; o
				 * WhatsApp ainda depende de canal que só o SaaS tem (`features.whatsapp`).
				 */}
				{features.motor && (
					<FilterPill
						label={t('jobs.filterMode')}
						value={mode}
						defaultValue='all'
						options={[
							// "modo" é masculino: `optionAll` ("todas") sai errado aqui
							{ value: 'all', label: t('jobs.optionAllMasc') },
							{ value: 'video', label: t('jobs.modeVideo') },
							{ value: 'voice', label: t('jobs.modeVoice') },
							...(features.whatsapp
								? [{ value: 'whatsapp', label: t('jobs.modeWhatsapp') }]
								: []),
						]}
						onChange={setMode}
					/>
				)}
				{podeFiltrarPorRecrutador && (
				<FilterPill
					label={t('jobs.filterRecruiter')}
					value={creatorId}
					defaultValue='all'
					options={creatorOptions}
					onChange={setCreatorId}
				/>
				)}
				<FilterPill
					label={t('jobs.filterPriority')}
					value={priority}
					defaultValue='all'
					options={[
						{ value: 'all', label: t('jobs.optionAll') },
						{ value: 'true', label: t('jobs.optionPriority') },
						{ value: 'false', label: t('jobs.optionNoPriority') },
					]}
					onChange={setPriority}
				/>

				{/* arquivadas é atributo da vaga, não tipo de entrevista — ao lado dos
				    ícones de tipo dava a entender que era mais um tipo */}
				<ToggleChip active={showArchived} onClick={() => setShowArchived((v) => !v)}>
					<span className='inline-flex items-center gap-1.5'>
						<Archive size={12} strokeWidth={1.75} />
						{t('jobs.filterArchived')}
					</span>
				</ToggleChip>
				<span className='mx-1 h-5 w-px bg-border' />
				<div className='relative'>
					<Search size={13} className='absolute left-2.5 top-1/2 -translate-y-1/2 text-muted' />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t('jobs.searchPlaceholder')}
						className='h-8 w-64 rounded-full border border-border bg-surface pl-8 pr-3 text-[13px] text-text transition-colors duration-150'
					/>
				</div>

				<AdvancedFilters values={advanced} onApply={setAdvanced} />

				<ViewToggle value={view} onChange={setView} />
			</div>

			<ActiveFilterChips
				values={advanced}
				onRemove={(key) => setAdvanced((a) => ({ ...a, [key]: EMPTY_ADVANCED[key] }))}
			/>

			<div className='mb-2 flex items-center justify-between gap-3'>
				<StageLegend />
			</div>

			{isError && (
				<div className='flex items-center justify-between rounded-xl border border-border bg-danger-soft px-4 py-3 text-[13px] text-danger'>
					{t('jobs.error')}
					<Button variant='secondary' size='sm' onClick={() => refetch()}>
						<RefreshCw size={12} /> {t('jobs.retry')}
					</Button>
				</div>
			)}

			{!isError && (
				<div className={cn('transition-opacity duration-150', isFetching && 'opacity-60')}>
					{view === 'table' ? (
						<JobsTable
							rows={rows}
							isLoading={isLoading}
							hasFilter={temFiltroAtivo}
							sortHeader={SortHeader}
						/>
					) : (
						<JobsGrid rows={rows} isLoading={isLoading} hasFilter={temFiltroAtivo} />
					)}

					<Pagination
						page={page}
						totalPages={totalPages}
						total={total}
						rangeStart={rangeStart}
						rangeEnd={rangeEnd}
						items={t('pagination.items.jobs')}
					onChange={setPage}
					/>
				</div>
			)}
		</div>
	)
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
	const { t } = useTranslation()
	return (
		<div className='px-4 py-14 text-center'>
			<p className='font-display text-[15px] font-semibold'>
				{hasFilter ? t('jobs.emptyFilteredTitle') : t('jobs.emptyTitle')}
			</p>
			<p className='mt-1 text-[12px] text-muted'>
				{hasFilter ? t('jobs.emptyFilteredSubtitle') : t('jobs.emptySubtitle')}
			</p>
		</div>
	)
}

function JobsTable({
	rows,
	isLoading,
	hasFilter,
	sortHeader: SortHeader,
}: {
	rows: JobRow[]
	isLoading: boolean
	hasFilter: boolean
	sortHeader: (props: {
		field: 'name' | 'createdAt'
		label: string
		align?: 'left' | 'right'
	}) => React.ReactElement
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	return (
		/*
		 * `overflow-hidden` sozinho CLIPAVA a tabela: uma vaga de título longo
		 * empurrava a largura e as colunas da direita (status, trilha, etapas,
		 * SLA) simplesmente sumiam, sem barra pra rolar até elas. O corte fica
		 * no wrapper — que é quem arredonda a borda — e a rolagem horizontal
		 * mora numa camada própria, com largura mínima pra tabela não espremer
		 * as colunas em vez de rolar.
		 */
		<div className='overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(15,16,20,0.04)]'>
			<div className='overflow-x-auto'>
			<table className='w-full min-w-[980px] border-collapse text-[13px]'>
				<thead>
					<tr className='border-b border-border text-left text-[10px] uppercase tracking-wider text-muted'>
						<th className='px-4 py-2.5 font-semibold'>
							<SortHeader field='name' label={t('jobs.colJob')} />
						</th>
						<th className='px-3 py-2.5 font-semibold'>{t('jobs.colStatus')}</th>
						<th className='w-[150px] px-3 py-2.5 font-semibold'>{t('jobs.colTrail')}</th>
						<th className='w-[200px] px-3 py-2.5 font-semibold'>{t('jobs.colStages')}</th>
						<th className='px-3 py-2.5 text-right font-semibold'>{t('jobs.colCandidates')}</th>
						<th className='px-3 py-2.5 text-right font-semibold'>
							<SortHeader field='createdAt' label={t('jobs.colOpenFor')} align='right' />
						</th>
						<th className='px-3 py-2.5 text-right font-semibold'>{t('jobs.colSla')}</th>
						<th className='px-4 py-2.5 font-semibold'>{t('jobs.colCreator')}</th>
						<th className='w-14 px-3 py-2.5' aria-label={t('filters.language')} />
					</tr>
				</thead>
				<tbody>
					{isLoading &&
						Array.from({ length: 8 }, (_, i) => (
							<tr key={i} className='border-b border-border-soft last:border-0'>
								<td className='px-4 py-3.5' colSpan={9}>
									<div className='h-4 animate-pulse rounded bg-card-alt' />
								</td>
							</tr>
						))}
					{!isLoading && rows.length === 0 && (
						<tr>
							<td colSpan={9}>
								<EmptyState hasFilter={hasFilter} />
							</td>
						</tr>
					)}
					{rows.map((job) => (
						<tr
							key={job.id}
							// clicar na vaga abre o BOARD dela: é o trabalho diário. A
							// configuração fica a um passo, no header do board.
							onClick={() => navigate({ to: '/vagas/$jobId/pipeline', params: { jobId: job.id } })}
							className='group cursor-pointer border-b border-border-soft transition-colors duration-150 last:border-0 hover:bg-hover'
						>
							<td className='relative px-4 py-3'>
								{/* prioridade na lista: pill no meio da linha poluía; barra lime
								    na borda marca a exceção sem interromper a leitura */}
								{job.priority && (
									<Tooltip side='right' label={t('jobs.priorityBadge')}>
										<span className='absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r bg-lime' />
									</Tooltip>
								)}
								<div className='flex items-center gap-3'>
									<JobTypeAnchor type={job.interviewType} size='sm' />
									{/* teto explícito: em layout automático a célula cresce até
									    caber o título inteiro, e um cargo comprido (os da Gupy
									    vêm com o edital no nome) empurrava a tabela pra fora */}
									<div className='min-w-0 max-w-[420px]'>
										<div className='flex min-w-0 items-center gap-2'>
											<JobReference job={job} className='shrink-0 text-[11px]' />
											<span className='truncate font-medium text-text transition-colors duration-150 group-hover:text-lime-fg'>
												{job.title}
											</span>
											<VisibilityIcon isPublic={job.isPublic} />
										</div>
										<JobMeta job={job} />
									</div>
								</div>
							</td>
							<td className='px-3 py-3'>
								<StatusBadge status={job.status} />
							</td>
							<td className='px-3 py-3'>
								<StageBars stages={job.trail} unit='days' />
							</td>
							<td className='px-3 py-3'>
								<StageBars stages={job.stages} />
							</td>
							<td className='font-num px-3 py-3 text-right font-medium'>{job.totalCandidates}</td>
							<td className='font-num px-3 py-3 text-right text-text-2'>
								{job.openForDays === null ? '—' : `${job.openForDays}d`}
							</td>
							<td className='px-3 py-3 text-right'>
								<SlaCell sla={job.sla} />
							</td>
							<td className='px-4 py-3 text-text-2'>{job.creator}</td>
							<td className='px-3 py-3'>
								<LanguageFlag language={job.language} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
			</div>
		</div>
	)
}

function CardMetric({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className='min-w-0'>
			<dt className='truncate text-[9px] uppercase tracking-wider text-muted'>{label}</dt>
			<dd className='font-num mt-0.5 text-[13px] font-medium text-text'>{value}</dd>
		</div>
	)
}

function JobsGrid({
	rows,
	isLoading,
	hasFilter,
}: {
	rows: JobRow[]
	isLoading: boolean
	hasFilter: boolean
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	if (isLoading) {
		return (
			<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
				{Array.from({ length: 8 }, (_, i) => (
					<div key={i} className='h-[132px] animate-pulse rounded-xl border border-border bg-card' />
				))}
			</div>
		)
	}

	if (rows.length === 0) {
		return (
			<div className='rounded-xl border border-border bg-card'>
				<EmptyState hasFilter={hasFilter} />
			</div>
		)
	}

	return (
		<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
			{rows.map((job) => (
				<article
					key={job.id}
					/*
					 * O card prometia o clique e não entregava: tinha `cursor-pointer` e
					 * hover de "clique aqui", e nada acontecia. Ele é a view padrão de
					 * quem prefere cards — ficava sem caminho nenhum pra abrir a vaga.
					 *
					 * Cliques vindos de um link ou botão passam direto: quem os tratou
					 * já sabe o que fazer, e navegar de novo por cima seria briga.
					 */
					onClick={(event) => {
						if ((event.target as HTMLElement).closest('a, button')) return
						navigate({ to: '/vagas/$jobId/pipeline', params: { jobId: job.id } })
					}}
					// hover precisa ser óbvio: borda lime + leve elevação + subida de
					// 2px. Só mudar cor de borda era discreto demais pra sinalizar
					// que o card inteiro é clicável.
					className='group relative flex cursor-pointer flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-lime-mid hover:shadow-[var(--shadow-pop)]'
				>
					{/* mesma marca de prioridade da lista: barra lime na borda —
					    uma linguagem só nas duas views (pill saiu, era redundante) */}
					{job.priority && (
						<Tooltip side='right' label={t('jobs.priorityBadge')}>
							<span className='absolute left-0 top-0 h-full w-[3px] bg-lime' />
						</Tooltip>
					)}
					{/* título ocupa a linha inteira: dividir espaço com os badges o
					    truncava mesmo em tela grande (feedback do produto) */}
					{/* topo em 3 blocos com respiro: cabeçalho (tipo + referência +
					    visibilidade + prioridade), título e metadados. Estava tudo
					    colado — alturas reservadas mantêm os cards do grid alinhados. */}
					<div>
						<div className='flex items-center gap-2'>
							<JobTypeAnchor type={job.interviewType} size='sm' />
							<JobReference job={job} />
							<VisibilityIcon isPublic={job.isPublic} />
							<LanguageFlag language={job.language} size='md' className='ml-auto' />
						</div>

						{/*
						 * O título é link de verdade; o card inteiro clica por cima dele.
						 *
						 * Só o `onClick` no <article> deixaria teclado e "abrir em nova
						 * aba" de fora. Só o link cobriria apenas o texto do título. A
						 * alternativa de esticar o link com `after:inset-0` cobriria o
						 * card todo — e junto os tooltips de prioridade, idioma e SLA,
						 * que ficariam inalcançáveis.
						 *
						 * Mesmo destino da linha da tabela: o board da vaga, que é o
						 * trabalho diário.
						 */}
						<Link
							to='/vagas/$jobId/pipeline'
							params={{ jobId: job.id }}
							className='mt-3 line-clamp-2 block min-h-[3.1rem] text-[16px] font-semibold leading-snug tracking-[-0.01em] text-text transition-colors duration-150 group-hover:text-lime-fg'
						>
							{job.title}
						</Link>

						<div className='mt-2 h-4'>
							<JobMeta job={job} />
						</div>
					</div>

					<StageBars stages={job.stages} />

					<div className='mt-auto border-t border-border-soft pt-3'>
						<StatusBadge status={job.status} />
						{/* números soltos não se explicam num card (na tabela o cabeçalho
						    faz esse trabalho) — cada métrica carrega o próprio rótulo */}
						<dl className='mt-2.5 grid grid-cols-3 gap-2'>
							<CardMetric label={t('jobs.colCandidates')} value={job.totalCandidates} />
							<CardMetric
								label={t('jobs.colOpenFor')}
								value={job.openForDays === null ? '—' : `${job.openForDays}d`}
							/>
							<CardMetric label={t('jobs.colSla')} value={<SlaCell sla={job.sla} />} />
						</dl>

						{/* criador só existe na tabela até aqui — no card a pessoa não
						    sabia de quem era a vaga */}
						<p className='mt-2.5 truncate border-t border-border-soft pt-2 text-[11px] text-muted'>
							{t('jobs.colCreator')}: <span className='text-text-2'>{job.creator}</span>
						</p>
					</div>
				</article>
			))}
		</div>
	)
}
