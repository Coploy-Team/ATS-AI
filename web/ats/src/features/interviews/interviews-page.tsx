import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'

import { empresa } from '@coploy/sdk/react'
import { refId } from '@/lib/ref'
import { normalizeScore } from '@/lib/score'
import { Page } from '@/ui/page'
import { Pagination } from '@/ui/pagination'
import { Segmented } from '@/ui/segmented'
import { SkeletonCard } from '@/ui/skeleton'

const PAGE_SIZE = 25

type Entrevista = {
	id: string
	name?: string
	email?: string
	occupation?: string
	score?: number | string | null
	finished?: boolean
	jobName?: string
	date?: string | null
	job_ref?: unknown
	job_applied_ref?: unknown
	user_ref?: unknown
}

/**
 * Todas as entrevistas da empresa, num lugar só.
 *
 * Antes só existia entrevista DENTRO de uma vaga. Quem quer saber "o que
 * aconteceu esta semana" — ou achar a pessoa cujo nome lembra mas a vaga não —
 * precisava abrir vaga por vaga. A busca global (⌘K) resolvia o caso do nome; a
 * leitura por período não tinha porta nenhuma.
 *
 * ⚠️ A rota já recorta por alcance no servidor: recrutador vê só as entrevistas
 * das vagas dele. A tela não precisa (nem deve) refazer esse corte.
 */
export function InterviewsPage() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const [page, setPage] = useState(1)
	const [find, setFind] = useState('')
	const [status, setStatus] = useState<'all' | 'finished' | 'pending'>('all')

	const { data, isLoading } = empresa.useGetCompaniesInterviews({
		page,
		limit: PAGE_SIZE,
		...(find.trim() ? { find: find.trim() } : {}),
	} as never)

	const payload = data?.data as
		| { interviews?: Entrevista[]; pagination?: { total?: number; totalPages?: number } }
		| undefined
	/*
	 * Concluída / em andamento é decidido AQUI, pelo `finished` de cada linha:
	 * o parâmetro `status` da API é a etapa do candidato, não o estado da
	 * entrevista — mandá-lo com "pending" devolvia vazio com a linha na tela
	 * dizendo "em andamento".
	 */
	const linhas = useMemo(() => {
		const todas = payload?.interviews ?? []
		if (status === 'all') return todas
		return todas.filter((row) => (status === 'finished' ? row.finished !== false : row.finished === false))
	}, [payload, status])
	const total = status === 'all' ? (payload?.pagination?.total ?? linhas.length) : linhas.length

	return (
		<Page title={t('interviews.title')} subtitle={t('interviews.subtitle')}>
			<div className='mb-3 flex flex-wrap items-center gap-2'>
				<Segmented
					value={status}
					onChange={(v) => {
						setStatus(v as typeof status)
						setPage(1)
					}}
					options={[
						{ value: 'all', label: t('interviews.filterAll') },
						{ value: 'finished', label: t('interviews.filterFinished') },
						{ value: 'pending', label: t('interviews.filterPending') },
					]}
				/>
				<div className='relative'>
					<Search
						size={13}
						className='pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted'
					/>
					<input
						value={find}
						onChange={(e) => {
							setFind(e.target.value)
							setPage(1)
						}}
						placeholder={t('interviews.searchPlaceholder')}
						className='h-8 w-[240px] rounded-lg border border-border bg-surface pr-2.5 pl-7 text-[12.5px] text-text'
					/>
				</div>
			</div>

			{isLoading ? (
				<SkeletonCard lines={5} />
			) : linhas.length === 0 ? (
				<p className='rounded-xl border border-border bg-surface px-4 py-12 text-center text-[13px] text-muted'>
					{find.trim() || status !== 'all'
						? t('interviews.emptyFiltered')
						: t('interviews.empty')}
				</p>
			) : (
				/* rolagem em camada própria: nome de vaga da Gupy traz o edital inteiro
				   e empurrava as colunas da direita para fora sem barra */
				<div className='overflow-x-auto rounded-xl border border-border bg-surface'>
					<table className='w-full min-w-[680px] text-[14px]'>
						<thead>
							<tr className='border-b border-border text-left'>
								<th className='px-4 py-2.5 font-medium'>{t('interviews.colPerson')}</th>
								<th className='px-4 py-2.5 font-medium'>{t('interviews.colJob')}</th>
								<th className='px-4 py-2.5 font-medium'>{t('interviews.colScore')}</th>
								<th className='px-4 py-2.5 font-medium'>{t('interviews.colWhen')}</th>
							</tr>
						</thead>
						<tbody>
							{linhas.map((row) => {
								const jobId = refId(row.job_ref)
								const candidateId = refId(row.job_applied_ref) ?? refId(row.user_ref)
								const nota = normalizeScore(row.score)
								return (
									<tr
										key={row.id}
										onClick={() => {
											if (jobId && candidateId) {
												navigate({
													to: '/vagas/$jobId/candidatos/$candidateId',
													params: { jobId, candidateId },
												})
											}
										}}
										className='cursor-pointer border-b border-border-soft last:border-0 hover:bg-hover'
									>
										<td className='px-4 py-2.5'>
											<p className='font-display text-[14px] font-semibold leading-tight tracking-[-0.01em]'>{row.name ?? '—'}</p>
											<p className='text-[11.5px] text-muted'>{row.email ?? ''}</p>
										</td>
										<td className='px-4 py-2.5'>{row.jobName ?? '—'}</td>
										<td className='px-4 py-2.5 font-display text-[14px] font-semibold tabular-nums'>
											{/* entrevista em andamento não tem nota — e "0" mentiria */}
											{row.finished === false
												? t('interviews.inProgress')
												: nota != null
													? nota.toFixed(1)
													: '—'}
										</td>
										<td className='px-4 py-2.5 text-muted'>
											{row.date ? new Date(row.date).toLocaleDateString() : '—'}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}

			{total > PAGE_SIZE && (
				<Pagination
					page={page}
					totalPages={payload?.pagination?.totalPages ?? 1}
					total={total}
					rangeStart={(page - 1) * PAGE_SIZE + 1}
					rangeEnd={(page - 1) * PAGE_SIZE + linhas.length}
					onChange={setPage}
					items={t('interviews.items')}
				/>
			)}
		</Page>
	)
}
