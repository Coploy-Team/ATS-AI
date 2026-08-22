import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronRight, RefreshCw, Search, Users, Download} from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCapabilities } from '@/lib/capabilities'

import { empresa } from '@coploy/sdk/react'

import { formatDuration } from '@/features/jobs/map'
import { normalizeStageKey, stageFill, stageLabel } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'
import { refId } from '@/lib/ref'
import { averageScore, normalizeScore } from '@/lib/score'
import { Button } from '@/ui/button'
import { FilterPill } from '@/ui/filter-pill'
import { Pagination } from '@/ui/pagination'
import { ToggleChip } from '@/ui/segmented'

import { CandidateCard } from './candidate-card'
import type { CandidateRow } from './types'
import { ReengageBar } from './reengage-bar'
import { csvFilename, downloadCsv, toCsv } from '@/lib/csv'
import { ViewToggle, type ViewMode } from '@/ui/view-toggle'

const PAGE_SIZE = 25
/** Parado além disto = esperando demais (mesma régua do pipeline). */
const STALLED_DAYS = 5

function toRow(dto: Record<string, unknown>): CandidateRow {
	const score = normalizeScore(dto.score)

	const since = (dto.dateSelect ?? dto.date) as string | undefined
	const sinceMs = since ? new Date(since).getTime() : null

	return {
		id: String(dto.id),
		userId: refId(dto.user_ref),
		name: (dto.name as string)?.trim() || '—',
		email: (dto.email as string) ?? null,
		photoUrl: (dto.photo_url as string) ?? null,
		occupation: (dto.occupation as string)?.trim() || null,
		score,
		stage: normalizeStageKey((dto.candidateStatus ?? dto.candidate_status ?? '') as string),
		jobId: refId(dto.job_ref),
		jobName: (dto.jobName as string) ?? null,
		waitingMs: sinceMs && !Number.isNaN(sinceMs) ? Math.max(0, Date.now() - sinceMs) : null,
	}
}

/**
 * Base de candidatos da empresa — a visão transversal que o Pipeline não dá.
 *
 * O Pipeline responde "como está ESTA vaga"; aqui a pergunta é "quem já passou
 * por nós". É a tela que sustenta o hunting interno: gente boa reprovada por
 * falta de fit numa vaga é o melhor pool pra próxima.
 *
 * Por isso a ordenação default é por NOTA e não por data: a lista existe pra
 * achar quem vale a pena, não pra ver o que chegou por último.
 */
export function CandidatesPage() {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const navigate = useNavigate()
	const [page, setPage] = useState(1)
	// semente da URL: quem chega pela busca global já cai com o filtro aplicado
	const initialSearch = (useSearch({ strict: false }) as { busca?: string }).busca ?? ''
	const [search, setSearch] = useState(initialSearch)
	const [debounced, setDebounced] = useState(initialSearch)
	const [stage, setStageRaw] = useState('')
	const setStage = (next: string) => {
		setStageRaw(next)
		setPage(1)
	}
	const [onlyScored, setOnlyScoredRaw] = useState(false)
	const setOnlyScored = (next: boolean) => {
		setOnlyScoredRaw(next)
		setPage(1)
	}
	/** Pessoas com a lista de entrevistas aberta. */
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	/** Pessoas marcadas para reengajar (V2-603) — uid de `users/{id}`. */
	const [picked, setPicked] = useState<Set<string>>(new Set())
	const [view, setView] = useState<ViewMode>('table')

	// digitar não pode disparar uma request por tecla
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebounced(search.trim())
			setPage(1)
		}, 350)
		return () => clearTimeout(timer)
	}, [search])

	/*
	 * Filtros no SERVIDOR (V2-204) e agrupamento por pessoa (V2-205).
	 *
	 * Antes etapa e nota eram filtrados no cliente, sobre a página atual: numa
	 * base de 110, "nota ≥ 8" devolvia o que houvesse nos 25 primeiros e parecia
	 * ser tudo. O agrupamento tinha o mesmo defeito — juntava só o que estava na
	 * mesma página, então quem tinha entrevistas em duas páginas aparecia duas
	 * vezes.
	 */
	const { data, isLoading, isFetching, isError, refetch } = empresa.useGetCompaniesInterviews({
		page: String(page),
		limit: String(PAGE_SIZE),
		groupBy: 'candidate',
		...(debounced ? { find: debounced } : {}),
		...(stage ? { status: stage } : {}),
		...(onlyScored ? { minScore: '0.1' } : {}),
	})

	const rows = useMemo(
		() =>
			(data?.data.interviews ?? [])
				.map((item) => toRow(item as Record<string, unknown>))
				.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
		[data],
	)

	/**
	 * Uma linha por PESSOA, não por entrevista.
	 *
	 * O v1 já fazia assim e faz sentido: procurando "henrique" o recrutador via
	 * 13 linhas do mesmo Henrique, uma por vaga, e precisava comparar de cabeça
	 * qual era a melhor. Agrupado, a pessoa aparece uma vez com a melhor nota e
	 * a etapa mais avançada; as entrevistas ficam a um clique.
	 *
	 * ⚠️ O agrupamento é da PÁGINA: a API pagina por entrevista, então alguém com
	 * entrevistas nas páginas 1 e 2 aparece nas duas. Agrupar de verdade exige
	 * endpoint por candidato — enquanto não existe, isto já resolve a leitura.
	 */
	/**
	 * O agrupamento vem do SERVIDOR: cada linha já é uma pessoa e traz as demais
	 * entrevistas em `otherInterviews`. O cliente só desembrulha.
	 */
	const people = useMemo(() => {
		const raw = data?.data.interviews ?? []
		return raw
			.map((item) => {
				const dto = item as Record<string, unknown>
				const row = toRow(dto)
				const others = Array.isArray(dto.otherInterviews)
					? (dto.otherInterviews as Array<Record<string, unknown>>).map(toRow)
					: []
				const interviews = [row, ...others]
				/*
				 * A nota da pessoa é a MÉDIA das entrevistas dela, não a maior.
				 *
				 * O servidor promove a melhor para linha-resumo (é o critério dele
				 * para escolher o cabeçalho), e a tela vinha imprimindo esse número
				 * como se fosse "a nota da pessoa" — divergindo do hunting, que já
				 * mostra média. `otherInterviews` traz TODAS as demais, então a média
				 * aqui é exata, não uma amostra da página.
				 */
				const average = averageScore(interviews.map((item) => item.score))
				return {
					key: row.userId ?? row.email ?? row.id,
					row: { ...row, score: average },
					interviews,
				}
			})
			.sort((a, b) => (b.row.score ?? -1) - (a.row.score ?? -1))
	}, [data])

	const pagination = data?.data.pagination
	/*
	 * `total: -1` é sentinela do core para "não contei".
	 *
	 * A listagem usa paginação barata (lê `limit + 1` e só verifica se há mais),
	 * então o total real sairia caro. Imprimir o sentinela dava "-1 candidatos na
	 * base" numa tela com 25 linhas; e como `totalPages` também vinha -1, a
	 * condição `> 1` escondia o paginador justamente quando havia mais páginas.
	 */
	const totalKnown = (pagination?.total ?? 0) >= 0
	const hasMore = pagination?.hasMore === true
	const stages = ['applied', 'pending', 'selected', 'approved', 'hired', 'rejected']

	/*
	 * Exporta o que está na tela — a lista já agrupada por pessoa e com os
	 * filtros aplicados. Exportar a base inteira ignorando o recorte entregaria
	 * um arquivo que não corresponde ao que o recrutador está vendo.
	 */
	function exportCsv() {
		const headers = [
			t('candidates.candidate'),
			t('candidates.email'),
			t('candidates.occupation'),
			t('candidates.job'),
			t('candidates.stage'),
			t('candidates.score'),
			t('candidates.waiting'),
		]
		const body = people.map(({ row, interviews }) => [
			row.name,
			row.email ?? '',
			row.occupation ?? '',
			interviews.length > 1
				? t('candidates.interviewCount', { count: interviews.length })
				: (row.jobName ?? ''),
			interviews.length > 1 ? t('candidates.multipleStages') : stageLabel(row.stage, t),
			row.score ?? '',
			row.waitingMs === null ? '' : Math.floor(row.waitingMs / 86_400_000),
		])
		downloadCsv(toCsv(headers, body), csvFilename('candidatos'))
	}

	return (
		<div className='flex h-full flex-col p-6'>
			<div className='mb-4 flex flex-wrap items-start justify-between gap-3'>
				<div>
					<h1 className='text-[20px]'>{t('candidates.title')}</h1>
					<p className='mt-1 text-[12.5px] text-text-2'>
						{isLoading
							? t('jobs.loading')
							: totalKnown
							? t('candidates.summary', { count: pagination?.total ?? 0 })
							: t('candidates.summaryAtLeast', { count: rows.length })}
					</p>
				</div>

				<Button variant='secondary' size='sm' onClick={exportCsv} disabled={people.length === 0}>
					<Download size={12} /> {t('export.action')}
				</Button>
			</div>

			<div className='mb-3 flex flex-wrap items-center gap-2'>
				<div className='flex h-8 min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-2.5'>
					<Search size={13} className='shrink-0 text-muted' />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t('candidates.searchPlaceholder')}
						className='w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-muted'
					/>
				</div>

				<FilterPill
					label={t('candidates.stage')}
					value={stage}
					defaultValue=''
					options={[
						{ value: '', label: t('candidates.allStages') },
						...stages.map((id) => ({ value: id, label: stageLabel(id, t) })),
					]}
					onChange={setStage}
				/>

				{features.motor && (
					<ToggleChip active={onlyScored} onClick={() => setOnlyScored(!onlyScored)}>
						{t('candidates.onlyScored')}
					</ToggleChip>
				)}

				<ViewToggle value={view} onChange={setView} />
			</div>

			{isError && (
				<div className='flex items-center justify-between rounded-xl border border-border bg-danger-soft px-4 py-3 text-[13px] text-danger'>
					{t('candidates.error')}
					<Button variant='secondary' size='sm' onClick={() => refetch()}>
						<RefreshCw size={12} /> {t('jobs.retry')}
					</Button>
				</div>
			)}

			{/*
			 * A GRADE.
			 *
			 * O alternador estava na barra desde o começo, mudava de estado e
			 * acendia o botão certo — e `view` não era lido em lugar nenhum: a
			 * tabela renderizava sempre. Clicar em "cards" não fazia nada, e foi
			 * assim que o Farofa achou.
			 *
			 * Na grade, quem tem várias entrevistas mostra todas dentro do próprio
			 * cartão: o cartão tem espaço, e expandir/recolher como na tabela
			 * mexeria na altura dos vizinhos da mesma linha.
			 */}
			{!isError && view === 'grid' && (
				<div className={cn('min-h-0 flex-1 overflow-auto transition-opacity', isFetching && 'opacity-60')}>
					{isLoading && (
						<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
							{Array.from({ length: 8 }, (_, i) => (
								<div key={i} className='h-[132px] animate-pulse rounded-xl border border-border bg-card' />
							))}
						</div>
					)}

					{!isLoading && rows.length === 0 && (
						<div className='rounded-xl border border-border bg-card px-4 py-16 text-center'>
							<Users size={20} className='mx-auto mb-2 text-muted' />
							<p className='text-[13px] font-medium'>{t('candidates.emptyTitle')}</p>
							<p className='mt-0.5 text-[12px] text-muted'>{t('candidates.emptyHint')}</p>
						</div>
					)}

					{!isLoading && rows.length > 0 && (
						<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
							{people.map(({ key, row, interviews }) => (
								<CandidateCard
									key={key}
									row={row}
									interviews={interviews}
									picked={row.userId ? picked.has(row.userId) : false}
									onPick={() => {
										if (!row.userId) return
										setPicked((current) => {
											const next = new Set(current)
											if (next.has(row.userId!)) next.delete(row.userId!)
											else next.add(row.userId!)
											return next
										})
									}}
									onOpen={(item) => {
										if (!item.jobId) return
										navigate({
											to: '/vagas/$jobId/candidatos/$candidateId',
											params: { jobId: item.jobId, candidateId: item.id },
										})
									}}
								/>
							))}
						</div>
					)}
				</div>
			)}

			{!isError && view === 'table' && (
				<div
					className={cn(
						'min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card transition-opacity',
						isFetching && 'opacity-60',
					)}
				>
					<table className='w-full border-collapse text-[13px]'>
						<thead>
							<tr className='border-b border-border text-left text-[10px] uppercase tracking-wider text-muted'>
								<th className='w-8 px-4 py-2.5 font-medium' />
								<th className='px-4 py-2.5 font-medium'>{t('candidates.candidate')}</th>
								<th className='px-4 py-2.5 font-medium'>{t('candidates.job')}</th>
								<th className='px-4 py-2.5 font-medium'>{t('candidates.stage')}</th>
								<th className='px-4 py-2.5 text-right font-medium'>{t('candidates.score')}</th>
								<th className='px-4 py-2.5 text-right font-medium'>{t('candidates.waiting')}</th>
							</tr>
						</thead>
						<tbody>
							{isLoading &&
								Array.from({ length: 8 }, (_, i) => (
									<tr key={i} className='border-b border-border-soft last:border-0'>
										<td colSpan={6} className='px-4 py-3'>
											<div className='h-5 animate-pulse rounded bg-card-alt' />
										</td>
									</tr>
								))}

							{!isLoading && rows.length === 0 && (
								<tr>
									<td colSpan={6} className='px-4 py-16 text-center'>
										<Users size={20} className='mx-auto mb-2 text-muted' />
										<p className='text-[13px] font-medium'>{t('candidates.emptyTitle')}</p>
										<p className='mt-0.5 text-[12px] text-muted'>{t('candidates.emptyHint')}</p>
									</td>
								</tr>
							)}

							{people.map(({ key, row, interviews }) => {
								const open = expanded.has(key)
								const best = interviews.reduce(
									(acc, item) =>
										(item.waitingMs ?? 0) > (acc.waitingMs ?? 0) ? item : acc,
									interviews[0],
								)
								const stalled =
									best.waitingMs !== null && best.waitingMs / 86_400_000 >= STALLED_DAYS
								const single = interviews.length === 1
								const only = interviews[0]

								const goTo = (item: CandidateRow) => {
									if (!item.jobId) return
									navigate({
										to: '/vagas/$jobId/candidatos/$candidateId',
										params: { jobId: item.jobId, candidateId: item.id },
									})
								}

								return (
									<Fragment key={key}>
										<tr
											onClick={() => {
												// uma entrevista só: a linha É a entrevista, abre direto
												if (single) return goTo(only)
												setExpanded((current) => {
													const next = new Set(current)
													if (next.has(key)) next.delete(key)
													else next.add(key)
													return next
												})
											}}
											className={cn(
												'group cursor-pointer border-b border-border-soft transition-colors last:border-0',
												open ? 'bg-card-alt' : 'hover:bg-hover',
											)}
										>
											{/*
											 * Seleção para reengajar (V2-603). `stopPropagation` porque a
											 * linha inteira navega: marcar uma pessoa não pode abrir a
											 * entrevista dela.
											 */}
											<td className='px-4 py-3' onClick={(event) => event.stopPropagation()}>
												<input
													type='checkbox'
													checked={row.userId ? picked.has(row.userId) : false}
													disabled={!row.userId}
													onChange={() => {
														if (!row.userId) return
														setPicked((current) => {
															const next = new Set(current)
															if (next.has(row.userId!)) next.delete(row.userId!)
															else next.add(row.userId!)
															return next
														})
													}}
													aria-label={t('candidates.select', { name: row.name })}
													className='h-3.5 w-3.5 accent-[var(--lime)]'
												/>
											</td>
											<td className='px-4 py-3'>
												<div className='flex items-center gap-2.5'>
													{/*
													 * O espaço da seta é reservado SEMPRE.
													 *
													 * Renderizar o chevron só em quem tem várias
													 * entrevistas fazia o avatar de quem tem uma só
													 * escorregar 13px para a esquerda — a coluna virava
													 * um zigue-zague, que é a "bagunça" da lista.
													 */}
													<ChevronRight
														size={13}
														aria-hidden={single}
														className={cn(
															'shrink-0 text-muted transition-transform',
															single && 'invisible',
															open && 'rotate-90',
														)}
													/>
													{row.photoUrl ? (
														<img
															src={row.photoUrl}
															alt=''
															loading='lazy'
															width={28}
															height={28}
															className='h-7 w-7 shrink-0 rounded-full object-cover'
														/>
													) : (
														<span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card-alt text-[10px] font-semibold text-text-2'>
															{row.name.slice(0, 2).toUpperCase()}
														</span>
													)}
													<div className='min-w-0'>
														<p className='truncate font-medium leading-tight transition-colors group-hover:text-lime-fg'>
															{row.name}
														</p>
														{row.occupation && (
															<p className='truncate text-[11.5px] text-muted'>
																{row.occupation}
															</p>
														)}
													</div>
												</div>
											</td>
											<td className='max-w-[220px] px-4 py-3'>
												<span className='block truncate text-[12.5px] text-text-2'>
													{single
														? (only.jobName ?? '—')
														: t('candidates.interviewCount', { count: interviews.length })}
												</span>
											</td>
											<td className='px-4 py-3'>
												{single ? (
													<span className='inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px]'>
														<span
															className={cn('h-1.5 w-1.5 rounded-full', stageFill(only.stage))}
														/>
														{stageLabel(only.stage, t)}
													</span>
												) : (
													<span className='text-[12px] text-muted'>
														{t('candidates.variousStages')}
													</span>
												)}
											</td>
											<td className='px-4 py-3 text-right'>
												{row.score !== null ? (
													<span
														className={cn(
															'font-num rounded-md border px-1.5 py-0.5 text-[12px] font-medium',
															row.score >= 8
																? 'border-lime-mid text-lime-fg'
																: 'border-border text-text-2',
														)}
														title={single ? undefined : t('candidates.averageScore')}
													>
														{row.score.toFixed(1).replace('.', ',')}
													</span>
												) : (
													<span className='text-[12px] text-muted'>—</span>
												)}
											</td>
											<td className='px-4 py-3 text-right'>
												<span
													className={cn(
														'font-num whitespace-nowrap text-[12px]',
														stalled ? 'text-danger' : 'text-muted',
													)}
												>
													{best.waitingMs !== null ? formatDuration(best.waitingMs) : '—'}
												</span>
											</td>
										</tr>

										{/* as entrevistas da pessoa, na ordem de nota */}
										{open &&
											!single &&
											[...interviews]
												.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
												.map((item) => (
													<tr
														key={item.id}
														onClick={() => goTo(item)}
														className='cursor-pointer border-b border-border-soft bg-card-alt/40 text-[12.5px] transition-colors last:border-0 hover:bg-hover'
													>
														<td className='py-2 pl-14 pr-4 text-muted'>—</td>
														<td className='max-w-[220px] px-4 py-2'>
															<span className='block truncate text-text-2'>
																{item.jobName ?? '—'}
															</span>
														</td>
														<td className='px-4 py-2'>
															<span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
																<span
																	className={cn(
																		'h-1.5 w-1.5 rounded-full',
																		stageFill(item.stage),
																	)}
																/>
																{stageLabel(item.stage, t)}
															</span>
														</td>
														<td className='px-4 py-2 text-right'>
															{item.score !== null ? (
																<span className='font-num text-text-2'>
																	{item.score.toFixed(1).replace('.', ',')}
																</span>
															) : (
																<span className='text-muted'>—</span>
															)}
														</td>
														<td className='px-4 py-2 text-right'>
															<span className='font-num text-muted'>
																{item.waitingMs !== null
																	? formatDuration(item.waitingMs)
																	: '—'}
															</span>
														</td>
													</tr>
												))}
									</Fragment>
								)
							})}
						</tbody>
					</table>
				</div>
			)}

			<ReengageBar userIds={[...picked]} onClear={() => setPicked(new Set())} />

			{pagination && (pagination.totalPages > 1 || hasMore || page > 1) && (
				<div className='mt-3'>
					<Pagination
						page={page}
						// sem total conhecido, existe pelo menos a próxima página
						totalPages={totalKnown ? pagination.totalPages : page + (hasMore ? 1 : 0)}
						total={totalKnown ? pagination.total : (page - 1) * PAGE_SIZE + rows.length}
						rangeStart={(page - 1) * PAGE_SIZE + 1}
						rangeEnd={
							totalKnown
								? Math.min(page * PAGE_SIZE, pagination.total)
								: (page - 1) * PAGE_SIZE + rows.length
						}
						items={t('pagination.items.candidates')}
						onChange={setPage}
					/>
				</div>
			)}
		</div>
	)
}

