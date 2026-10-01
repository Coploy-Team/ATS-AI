import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/features/jobs/map'
import { stageFill, stageLabel } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'
import { Popover, PopoverItem } from '@/ui/popover'

import type { CandidateRow } from './types'

/** Parado além disto = esperando demais (mesma régua do pipeline). */
const STALLED_DAYS = 5

/**
 * Uma pessoa, como CARTÃO.
 *
 * Mesma informação da linha, na ordem em que se lê um cartão: quem é, onde
 * está, como foi. A nota fica no canto porque é o que ordena a lista.
 *
 * Quem tem várias entrevistas mostra todas aqui dentro, uma por linha. Na
 * tabela elas abrem e fecham; num cartão isso esticaria a altura e empurraria
 * os vizinhos da mesma linha da grade.
 */
export function CandidateCard({
	row,
	interviews,
	picked,
	onPick,
	onOpen,
}: {
	row: CandidateRow
	interviews: CandidateRow[]
	picked: boolean
	onPick: () => void
	onOpen: (item: CandidateRow) => void
}) {
	const { t } = useTranslation()
	const single = interviews.length === 1
	const only = interviews[0]
	/** Da melhor nota para a pior — é a ordem em que o recrutador quer olhar. */
	const ordenadas = [...interviews].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
	const best = interviews.reduce(
		(acc, item) => ((item.waitingMs ?? 0) > (acc.waitingMs ?? 0) ? item : acc),
		interviews[0],
	)
	const stalled = best.waitingMs !== null && best.waitingMs / 86_400_000 >= STALLED_DAYS

	/*
	 * ALTURA FIXA.
	 *
	 * Sem ela, quem tem 19 entrevistas virava um cartão gigante ao lado de um de
	 * duas linhas: a grade ficava com "tela grande e tela pequena" na mesma
	 * linha. Agora todos têm a mesma altura e a lista rola dentro do cartão.
	 */
	return (
		<div className='group flex h-[228px] flex-col rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-lime-mid'>
			{/*
			 * O cabeçalho NÃO navega.
			 *
			 * Cheguei a fazer ele abrir a entrevista de melhor nota, e estava errado:
			 * a pessoa não pertence a uma vaga. Clicar no nome levava a uma vaga
			 * arbitrária e o recrutador perdia de vista em qual processo estava. Quem
			 * navega é a ENTREVISTA — cada linha abre a sua, e o rodapé abre a lista
			 * completa quando há mais do que cabe aqui.
			 */}
			<div className='flex items-start gap-2.5'>
				{/* marcar pra reengajar não pode abrir a entrevista */}
				<input
					type='checkbox'
					checked={picked}
					disabled={!row.userId}
					onClick={(event) => event.stopPropagation()}
					onChange={onPick}
					aria-label={t('candidates.select', { name: row.name })}
					className='mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--lime)]'
				/>
				{row.photoUrl ? (
					<img
						src={row.photoUrl}
						alt=''
						loading='lazy'
						width={32}
						height={32}
						className='h-8 w-8 shrink-0 rounded-full object-cover'
					/>
				) : (
					<span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card-alt text-[11px] font-semibold text-text-2'>
						{row.name.slice(0, 2).toUpperCase()}
					</span>
				)}
				<div className='min-w-0 flex-1'>
					<p className='truncate text-[13px] font-medium leading-tight transition-colors group-hover:text-lime-fg'>
						{row.name}
					</p>
					{row.occupation && <p className='truncate text-[11.5px] text-muted'>{row.occupation}</p>}
				</div>
				{row.score !== null && (
					<span
						className={cn(
							'font-num shrink-0 rounded-md border px-1.5 py-0.5 text-[12px] font-medium',
							row.score >= 8 ? 'border-lime-mid text-lime-fg' : 'border-border text-text-2',
						)}
						title={single ? undefined : t('candidates.averageScore')}
					>
						{row.score.toFixed(1).replace('.', ',')}
					</span>
				)}
			</div>

			{/*
			 * MESMA ESTRUTURA para uma ou muitas.
			 *
			 * Antes o cartão de uma entrevista tinha outro desenho (vaga solta e
			 * rodapé) e sobrava um vão no meio da altura fixa. Agora a entrevista
			 * única é uma linha da mesma lista, e o rodapé sempre carrega o tempo de
			 * espera — que é o que o recrutador precisa ver para saber quem está
			 * parado.
			 */}
			<div className='mt-3 flex flex-col rounded-lg bg-card-alt p-1'>
				{ordenadas.slice(0, 3).map((item) => (
					<button
						key={item.id}
						type='button'
						onClick={() => onOpen(item)}
						className='flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover'
					>
						<span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stageFill(item.stage))} />
						<span className='min-w-0 flex-1 truncate text-[12px] text-text-2'>
							{item.jobName ?? '—'}
						</span>
						<span className='font-num shrink-0 text-[11.5px] text-muted'>
							{item.score !== null ? item.score.toFixed(1).replace('.', ',') : '—'}
						</span>
					</button>
				))}
				{ordenadas.length > 3 && (
					<p className='px-2 pb-0.5 pt-1 text-[11.5px] text-muted'>
						{t('candidates.moreInterviews', { count: ordenadas.length - 3 })}
					</p>
				)}
			</div>

			<div className='mt-auto flex items-center justify-between gap-2 pt-2'>
				{single ? (
					<span className='truncate text-[12px] text-muted'>{stageLabel(only.stage, t)}</span>
				) : (
					/*
					 * TODAS as vagas da pessoa.
					 *
					 * O cartão mostra três; as demais ficavam num "+16 outras" que era
					 * texto morto — não havia como entrar nas outras vagas dela. Aqui
					 * elas estão inteiras, cada uma abrindo o seu processo.
					 */
					<Popover
						align='start'
						label={t('candidates.allInterviews')}
						trigger={
							<span className='truncate text-[12px] text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-text'>
								{t('candidates.interviewCount', { count: interviews.length })}
							</span>
						}
					>
						{(close) => (
							<div className='max-h-[260px] w-[280px] overflow-y-auto'>
								{ordenadas.map((item) => (
									<PopoverItem
										key={item.id}
										onClick={() => {
											close()
											onOpen(item)
										}}
									>
										<span className='flex w-full items-center gap-2'>
											<span
												className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stageFill(item.stage))}
											/>
											<span className='min-w-0 flex-1 truncate'>{item.jobName ?? '—'}</span>
											<span className='font-num shrink-0 text-[11.5px] text-muted-foreground'>
												{item.score !== null ? item.score.toFixed(1).replace('.', ',') : '—'}
											</span>
										</span>
									</PopoverItem>
								))}
							</div>
						)}
					</Popover>
				)}
				<span className={cn('font-num shrink-0 text-[12px]', stalled ? 'text-danger' : 'text-muted')}>
					{best.waitingMs !== null ? formatDuration(best.waitingMs) : '—'}
				</span>
			</div>
		</div>
	)
}
