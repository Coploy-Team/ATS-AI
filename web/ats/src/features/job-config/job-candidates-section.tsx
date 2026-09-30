import { Link } from '@tanstack/react-router'
import { ArrowRight, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { formatDuration } from '@/features/jobs/map'
import { toPipelineCard } from '@/features/pipeline/map'
import { stageFill, stageLabel } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'
import { Card } from '@/ui/page'

const STALLED_DAYS = 5
/** A lista aqui é panorama, não operação — o board é o lugar de trabalhar. */
const PREVIEW = 8

/**
 * Quem se candidatou a ESTA vaga.
 *
 * Faltava a ponte mais óbvia do produto: da vaga para as pessoas nela. O
 * Pipeline resolve por etapa e o Candidatos por empresa, mas ninguém
 * respondia "quem está nesta vaga" a partir da própria vaga.
 *
 * Ordena por nota porque quem abre a vaga quer ver os melhores primeiro, e
 * destaca quem está parado — é a informação que exige ação.
 */
export function JobCandidatesSection({ jobId }: { jobId: string }) {
	const { t } = useTranslation()
	const { data, isLoading } = empresa.useGetCompaniesJobsJobIdCandidates(
		jobId,
		{ limit: '200' },
		{ query: { enabled: Boolean(jobId) } },
	)

	const payload = data?.data && 'candidates' in data.data ? data.data : null
	const cards = useMemo(() => {
		const list = (payload?.candidates ?? []).map(toPipelineCard)
		return [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
	}, [payload])

	const stalled = cards.filter(
		(card) => card.inStageMs !== null && card.inStageMs / 86_400_000 >= STALLED_DAYS,
	).length

	return (
		<Card
			title={t('jobConfig.candidatesTitle')}
			description={
				isLoading
					? t('jobs.loading')
					: stalled > 0
						? t('jobConfig.candidatesWithStalled', { count: cards.length, stalled })
						: t('jobConfig.candidatesCount', { count: cards.length })
			}
			actions={
				<Link
					to='/pipeline'
					search={{ vaga: jobId }}
					className='inline-flex items-center gap-1 text-[12px] text-lime-fg hover:underline'
				>
					{t('jobConfig.openPipeline')} <ArrowRight size={12} />
				</Link>
			}
		>
			{isLoading && (
				<div className='flex flex-col gap-2'>
					{Array.from({ length: 4 }, (_, i) => (
						<div key={i} className='h-10 animate-pulse rounded-lg bg-card-alt' />
					))}
				</div>
			)}

			{!isLoading && cards.length === 0 && (
				<div className='py-8 text-center'>
					<Users size={18} className='mx-auto mb-2 text-muted' />
					<p className='text-[12.5px] font-medium'>{t('jobConfig.candidatesEmpty')}</p>
					<p className='mt-0.5 text-[11.5px] text-muted'>{t('jobConfig.candidatesEmptyHint')}</p>
				</div>
			)}

			{!isLoading && cards.length > 0 && (
				<>
					<ul className='flex flex-col divide-y divide-border-soft'>
						{cards.slice(0, PREVIEW).map((card) => {
							const isStalled =
								card.inStageMs !== null && card.inStageMs / 86_400_000 >= STALLED_DAYS
							return (
								<li key={card.id}>
									<Link
										to='/vagas/$jobId/candidatos/$candidateId'
										params={{ jobId, candidateId: card.id }}
										className='group flex items-center gap-3 py-2 transition-colors hover:bg-hover'
									>
										{card.photoUrl ? (
											<img
												src={card.photoUrl}
												alt=''
												loading='lazy'
												width={28}
												height={28}
												className='h-7 w-7 shrink-0 rounded-full object-cover'
											/>
										) : (
											<span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card-alt text-[10px] font-semibold text-text-2'>
												{card.name.slice(0, 2).toUpperCase()}
											</span>
										)}

										<span className='min-w-0 flex-1'>
											<span className='block truncate text-[12.5px] font-medium transition-colors group-hover:text-lime-fg'>
												{card.name}
											</span>
											{card.occupation && (
												<span className='block truncate text-[11px] text-muted'>
													{card.occupation}
												</span>
											)}
										</span>

										<span className='inline-flex shrink-0 items-center gap-1.5 text-[11.5px] text-text-2'>
											<span className={cn('h-1.5 w-1.5 rounded-full', stageFill(card.stage))} />
											{stageLabel(card.stage, t)}
										</span>

										<span
											className={cn(
												'font-num w-16 shrink-0 text-right text-[11.5px]',
												isStalled ? 'font-medium text-amber' : 'text-muted',
											)}
										>
											{card.inStageMs === null ? '—' : formatDuration(card.inStageMs)}
										</span>

										<span className='font-num w-10 shrink-0 text-right text-[12px] font-medium'>
											{card.score !== null ? card.score.toFixed(1).replace('.', ',') : '—'}
										</span>
									</Link>
								</li>
							)
						})}
					</ul>

					{cards.length > PREVIEW && (
						<Link
							to='/pipeline'
							search={{ vaga: jobId }}
							className='mt-2 block text-center text-[12px] text-muted transition-colors hover:text-text'
						>
							{t('jobConfig.candidatesMore', { count: cards.length - PREVIEW })}
						</Link>
					)}
				</>
			)}
		</Card>
	)
}
