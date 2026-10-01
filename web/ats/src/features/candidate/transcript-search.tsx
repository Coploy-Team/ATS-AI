import { Loader2, Play, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { Button } from '@/ui/button'
import { Card } from '@/ui/page'

/**
 * Busca nas transcrições: o recrutador pergunta e vê o trecho em que a pessoa
 * falou disso, com o tempo do vídeo, ou "não encontrei". Olha as entrevistas
 * que ela fez para esta empresa e, quando compartilhou o perfil Coploy, o que
 * publicou na página dela. A resposta escrita pela IA aparece só quando é
 * permitida, sempre com os trechos embaixo; pergunta de avaliação é recusada.
 */

type SearchResponse = Awaited<ReturnType<typeof empresa.postCompaniesJobsJobIdCandidatesCandidateIdTranscriptSearch>>
type SearchResult = Extract<SearchResponse, { status: 200 }>['data']
type Hit = SearchResult['hits'][number]

export interface SearchVideo {
	itemId: string
	questionLabel: string | null
	videoUrl: string | null
}

function clock(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds))
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function TranscriptSearch({
	jobId,
	candidateId,
	firstName,
	videos = [],
	onOpen,
}: {
	jobId: string
	candidateId: string
	firstName: string
	videos?: SearchVideo[]
	onOpen: (video: SearchVideo, startAt: number | null) => void
}) {
	const { t } = useTranslation()
	const search = empresa.usePostCompaniesJobsJobIdCandidatesCandidateIdTranscriptSearch()
	const [query, setQuery] = useState('')
	const [asked, setAsked] = useState('')
	const [result, setResult] = useState<SearchResult | null>(null)
	const [error, setError] = useState<string | null>(null)

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault()
		const text = query.trim()
		if (text.length < 3) return
		setError(null)
		try {
			const response = await search.mutateAsync({ jobId, candidateId, data: { query: text } })
			if (response.status !== 200) {
				setResult(null)
				setError((response.data as { message?: string }).message ?? t('candidate.transcriptSearch.error'))
				return
			}
			setAsked(text)
			setResult(response.data)
		} catch {
			setError(t('candidate.transcriptSearch.error'))
		}
	}

	if (result?.status === 'not_available') return null
	const videoOf = (hit: Hit): SearchVideo =>
		videos.find((video) => video.itemId === hit.itemId) ?? { itemId: hit.itemId, questionLabel: hit.questionLabel, videoUrl: hit.videoUrl }

	return (
		<div>
			<p className='font-mono text-[10.5px] uppercase tracking-wider text-lime-fg'>{t('candidate.transcriptSearch.eyebrow')}</p>
			<form onSubmit={(event) => void onSubmit(event)} className='mt-2 flex gap-2'>
				<label htmlFor={`transcript-search-${candidateId}`} className='sr-only'>{t('candidate.transcriptSearch.label', { name: firstName })}</label>
				<input
					id={`transcript-search-${candidateId}`}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					maxLength={300}
					placeholder={t('candidate.transcriptSearch.placeholder', { name: firstName })}
					className='min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-text'
				/>
				<Button type='submit' disabled={search.isPending || query.trim().length < 3}>
					{search.isPending ? <Loader2 size={13} className='animate-spin' /> : <Search size={13} />}
					{t('candidate.transcriptSearch.submit')}
				</Button>
			</form>

			{error && <p className='mt-2 text-[12px] text-danger'>{error}</p>}

			{result?.status === 'found' && (
				<div className='mt-3 flex flex-col gap-3'>
					{result.answer && (
						<div className='rounded-lg border border-lime-mid bg-lime-soft/40 p-3'>
							<p className='text-[13.5px] font-medium leading-relaxed'>{result.answer}</p>
							<p className='mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-text-2'>
								<Sparkles size={11} /> {t('candidate.transcriptSearch.aiWritten')}
							</p>
						</div>
					)}
					{result.hits.map((hit, index) => {
						const video = videoOf(hit)
						return (
							<div key={`${hit.itemId}-${index}`} className='grid grid-cols-[56px_minmax(0,1fr)] gap-3'>
								<button
									type='button'
									onClick={() => onOpen(video, hit.start)}
									aria-label={t('candidate.transcriptSearch.watch')}
									className='relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-black'
								>
									{video.videoUrl && (
										<video src={`${video.videoUrl}#t=${Math.max(0.5, hit.start ?? 0.5)}`} preload='metadata' muted playsInline className='h-full w-full object-cover' />
									)}
									<span className='absolute inset-0 m-auto grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white'>
										<Play size={10} className='ml-0.5' />
									</span>
								</button>
								<div className='min-w-0'>
									<p className='text-[13px] leading-relaxed'>“{hit.text}”</p>
									<div className='mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-text-2'>
										{hit.start !== null && (
											<span className='rounded-full border border-border px-2 py-0.5 font-mono tabular-nums text-text'>{clock(hit.start)}</span>
										)}
										<span>{t(`candidate.transcriptSearch.source.${hit.source}`)}</span>
										{hit.questionLabel && <span className='truncate'>· {hit.questionLabel}</span>}
									</div>
									<button type='button' onClick={() => onOpen(video, hit.start)} className='mt-1.5 text-[12.5px] font-medium text-lime-fg hover:underline'>
										{hit.start !== null ? t('candidate.transcriptSearch.watchFrom', { time: clock(hit.start) }) : t('candidate.transcriptSearch.watch')}
									</button>
								</div>
							</div>
						)
					})}
				</div>
			)}

			{result?.status === 'not_found' && (
				<div className='mt-3 rounded-lg border border-dashed border-border p-3 text-[12.5px]'>
					<b>{t('candidate.transcriptSearch.notFoundTitle')}</b>{' '}
					<span className='text-text-2'>{t('candidate.transcriptSearch.notFound', { name: firstName, query: asked })}</span>
				</div>
			)}

			{result?.status === 'evaluative' && (
				<div className='mt-3 rounded-lg border border-dashed border-border p-3 text-[12.5px] text-text-2'>
					{t('candidate.transcriptSearch.evaluative')}
				</div>
			)}

			{result?.status === 'no_published_answers' && (
				<p className='mt-3 text-[12.5px] text-text-2'>{t('candidate.transcriptSearch.noAnswers', { name: firstName })}</p>
			)}

			<p className='mt-2 text-[11px] text-text-2'>
				{t('candidate.transcriptSearch.hint')}
				{typeof result?.remainingToday === 'number' && result.remainingToday < 50
					? ` ${t('candidate.transcriptSearch.remaining', { count: result.remainingToday })}`
					: ''}
			</p>
		</div>
	)
}

/** A busca sozinha, para a ficha de quem fez a entrevista da empresa (sem o painel do perfil Coploy). */
export function TranscriptSearchCard({ jobId, candidateId, candidateName }: { jobId: string; candidateId: string; candidateName: string }) {
	const [opened, setOpened] = useState<{ video: SearchVideo; startAt: number | null } | null>(null)
	return (
		<Card>
			<TranscriptSearch
				jobId={jobId}
				candidateId={candidateId}
				firstName={candidateName.split(' ')[0] || candidateName}
				onOpen={(video, startAt) => setOpened({ video, startAt })}
			/>
			{opened && <SearchVideoModal video={opened.video} startAt={opened.startAt} onClose={() => setOpened(null)} />}
		</Card>
	)
}

function SearchVideoModal({ video, startAt, onClose }: { video: SearchVideo; startAt: number | null; onClose: () => void }) {
	const { t } = useTranslation()
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])
	return (
		<div
			role='dialog'
			aria-modal='true'
			aria-label={video.questionLabel ?? t('candidate.transcriptSearch.watch')}
			onMouseDown={(event) => event.target === event.currentTarget && onClose()}
			className='fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 sm:p-4'
		>
			<div className='w-[min(420px,96vw)] rounded-2xl border border-border bg-card p-4 shadow-2xl'>
				<div className='mb-3 flex items-start justify-between gap-3'>
					<h4 className='font-display text-[14px] font-semibold'>{video.questionLabel}</h4>
					<button type='button' onClick={onClose} aria-label={t('filters.close')} className='rounded-lg p-1 text-text-2 hover:text-text'>
						<X size={16} />
					</button>
				</div>
				{video.videoUrl && (
					<video
						src={startAt ? `${video.videoUrl}#t=${Math.floor(startAt)}` : video.videoUrl}
						controls
						autoPlay
						playsInline
						className='max-h-[70dvh] w-full rounded-xl bg-black'
					/>
				)}
			</div>
		</div>
	)
}
