import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { RequireCapability } from '@/components/require-capability'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card } from '@/ui/page'

import { TranscriptSearch, type SearchVideo } from './transcript-search'

/**
 * O perfil Coploy que o candidato compartilhou no lugar da entrevista (F5).
 *
 * Substitui o "lembrar de terminar" para quem escolheu o perfil: não há
 * entrevista a cobrar, há um perfil a olhar. Mostra a compatibilidade com ESTA
 * vaga (a regra do COP-11, sem nota) e o que a página `@` da pessoa já mostra a
 * qualquer visitante — vídeos, leituras que ela ligou, resumo, links e
 * projetos. A empresa de outro processo nunca aparece (D1, 30/09).
 */

type Dossier = Awaited<ReturnType<typeof empresa.getCompaniesJobsJobIdCandidatesCandidateIdDossier>>
type CoployProfile = NonNullable<Extract<Dossier, { status: 200 }>['data']['application']['coployProfile']>
type PublicVideo = NonNullable<CoployProfile['publicView']>['videos'][number]

function formatDuration(seconds: number): string {
	const minutes = Math.max(1, Math.round(seconds / 60))
	if (minutes < 60) return `${minutes} min`
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`
}

function linkLabel(url: string): string {
	try {
		const host = new URL(url).hostname.replace(/^www\./, '')
		if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'LinkedIn'
		if (host === 'github.com') return 'GitHub'
		return host
	} catch {
		return url
	}
}

export function CoployProfilePanel({
	jobId,
	candidateId,
	profile,
	candidateName,
	onRequestInterview,
}: {
	jobId: string
	candidateId: string
	profile: CoployProfile
	candidateName: string
	onRequestInterview: () => void
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const accept = empresa.usePostCompaniesJobsJobIdCandidatesCandidateIdAcceptCoployProfile()
	const [opened, setOpened] = useState<{ video: PublicVideo; startAt?: number | null } | null>(null)
	const [error, setError] = useState<string | null>(null)
	const view = profile.publicView
	const compatibility = profile.compatibility
	const firstName = candidateName.split(' ')[0] || candidateName

	async function onAccept() {
		setError(null)
		try {
			const response = await accept.mutateAsync({ jobId, candidateId })
			if (response.status !== 200) {
				setError((response.data as { message?: string }).message ?? t('candidate.coployProfile.acceptError'))
				return
			}
			await queryClient.invalidateQueries({
				queryKey: empresa.getGetCompaniesJobsJobIdCandidatesCandidateIdDossierQueryKey(jobId, candidateId),
			})
			await queryClient.invalidateQueries({ queryKey: empresa.getGetCompaniesJobsQueryKey(), exact: false })
		} catch {
			setError(t('candidate.coployProfile.acceptError'))
		}
	}

	return (
		<Card>
			<div className='flex flex-wrap items-baseline justify-between gap-3'>
				<div className='min-w-0'>
					<p className='font-mono text-[11px] uppercase tracking-[0.12em] text-lime-fg'>
						{t('candidate.coployProfile.eyebrow')}
					</p>
					<h3 className='mt-1 font-display text-[17px] font-bold'>
						{t('candidate.coployProfile.title', { name: firstName })}
					</h3>
				</div>
				{compatibility?.score !== null && compatibility?.score !== undefined ? (
					<span className='rounded-full bg-lime-soft px-3 py-1 font-mono text-[13px] tabular-nums text-lime-fg'>
						{t('candidate.coployProfile.match', { score: compatibility.score })}
					</span>
				) : (
					<span className='text-[12px] text-text-2'>{t('candidate.coployProfile.noMatch')}</span>
				)}
			</div>

			{compatibility && compatibility.tags.length > 0 && (
				<div className='mt-3 flex flex-wrap gap-1.5'>
					{compatibility.tags.map((tag, index) => (
						<span
							key={`${tag.kind}-${tag.label}-${index}`}
							className={cn(
								'rounded-md border px-1.5 py-0.5 text-[11.5px]',
								tag.matched ? 'border-lime-mid bg-lime-soft text-lime-fg' : 'border-border text-text-2',
							)}
						>
							{tag.matched ? '✓' : '✗'} {tag.label}
						</span>
					))}
				</div>
			)}

			{view ? (
				<>
					{view.videos.length > 0 && (
						<div className='mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4'>
							{view.videos.map((video) => (
								<button
									key={video.itemId}
									type='button'
									onClick={() => setOpened({ video })}
									className='group text-left'
								>
									<div className='relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-black'>
										{video.videoUrl && (
											<video src={`${video.videoUrl}#t=0.5`} preload='metadata' muted playsInline className='h-full w-full object-cover' />
										)}
										<span className='absolute inset-0 m-auto grid h-8 w-8 place-items-center rounded-full border border-white/25 bg-black/55 text-white'>
											<Play size={12} className='ml-0.5' />
										</span>
									</div>
									<p className='mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-text-2 group-hover:text-text'>
										{video.questionLabel || t('candidate.coployProfile.video')}
									</p>
								</button>
							))}
						</div>
					)}
					<div className='mt-3 border-t border-border pt-3 text-[12.5px] text-text-2'>
						{view.summary && (view.summary.skills.length > 0 || view.summary.strongestDimension) && (
							<p>
								{t('candidate.coployProfile.summary')}{' '}
								{[...view.summary.skills.slice(0, 6), ...view.summary.recurringStrengths.slice(0, 3)].join(', ')}
								{view.summary.strongestDimension
									? ` · ${t('candidate.coployProfile.strongest', { dimension: t(`candidate.coployProfile.dimension.${view.summary.strongestDimension}`) })}`
									: ''}
							</p>
						)}
						<p className='mt-1'>
							{view.stats.interviews > 0 && t('candidate.coployProfile.interviews', { count: view.stats.interviews })}
							{view.stats.videoSeconds ? ` · ${t('candidate.coployProfile.videoTime', { time: formatDuration(view.stats.videoSeconds) })}` : ''}
							{view.stats.interviews > 0 ? ' · ' : ''}
							<a
								href={view.url}
								target='_blank'
								rel='noopener noreferrer'
								className='inline-flex items-center gap-1 font-medium text-lime-fg hover:underline'
							>
								@{view.handle} <ExternalLink size={11} />
							</a>
						</p>
						{(view.links.length > 0 || view.projects.length > 0) && (
							<div className='mt-2 flex flex-wrap gap-1.5'>
								{view.links.map((url) => (
									<a key={url} href={url} target='_blank' rel='noopener noreferrer' title={url} className='rounded-full border border-border px-2.5 py-0.5 text-[11.5px] hover:border-lime-mid'>
										{linkLabel(url)}
									</a>
								))}
								{view.projects.map((project) => {
									const href = project.link ?? project.repo
									return href ? (
										<a key={project.title} href={href} target='_blank' rel='noopener noreferrer' title={project.description ?? href} className='rounded-full border border-border px-2.5 py-0.5 text-[11.5px] hover:border-lime-mid'>
											{project.title}
										</a>
									) : (
										<span key={project.title} className='rounded-full border border-border px-2.5 py-0.5 text-[11.5px]'>{project.title}</span>
									)
								})}
							</div>
						)}
					</div>
				</>
			) : (
				<p className='mt-3 text-[12.5px] text-text-2'>{t('candidate.coployProfile.noPublicPage')}</p>
			)}

			{view && view.videos.length > 0 && (
				<div className='mt-4 border-t border-border pt-4'>
					<TranscriptSearch
						jobId={jobId}
						candidateId={candidateId}
						firstName={firstName}
						videos={view.videos}
						onOpen={(video: SearchVideo, startAt) => setOpened({ video: { answer: null, feedback: null, strengths: [], ...video }, startAt })}
					/>
				</div>
			)}

			<RequireCapability capability='candidate:move'>
				{profile.canAccept ? (
					<div className='mt-4 flex flex-wrap items-center gap-2'>
						{profile.acceptsProfile && (
							<Button variant='primary' onClick={() => void onAccept()} disabled={accept.isPending}>
								<Check size={14} />
								{t('candidate.coployProfile.accept')}
							</Button>
						)}
						<Button onClick={onRequestInterview}>
							{t('candidate.coployProfile.requestInterview')}
						</Button>
						<p className='basis-full text-[11.5px] text-text-2'>
							{t(profile.acceptsProfile ? 'candidate.coployProfile.acceptHint' : 'candidate.coployProfile.jobRequiresInterview')}
						</p>
						{error && <p className='basis-full text-[12px] text-danger'>{error}</p>}
					</div>
				) : (
					<p className='mt-4 text-[12px] text-text-2'>{t('candidate.coployProfile.alreadyMoved')}</p>
				)}
			</RequireCapability>

			{opened && <VideoModal video={opened.video} startAt={opened.startAt ?? null} onClose={() => setOpened(null)} />}
		</Card>
	)
}

function VideoModal({ video, startAt, onClose }: { video: PublicVideo; startAt: number | null; onClose: () => void }) {
	const { t } = useTranslation()
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])
	const title = video.questionLabel || t('candidate.coployProfile.video')
	return (
		<div
			role='dialog'
			aria-modal='true'
			aria-label={title}
			onMouseDown={(event) => event.target === event.currentTarget && onClose()}
			className='fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 sm:p-4'
		>
			<div className='max-h-[94dvh] w-[min(860px,96vw)] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl'>
				<div className='grid gap-5 p-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] sm:p-6'>
					<div className='mx-auto aspect-[9/16] h-[45dvh] overflow-hidden rounded-xl bg-black sm:mx-0 sm:h-auto sm:max-h-[420px] sm:w-full'>
						{video.videoUrl && (
							<video
								src={startAt ? `${video.videoUrl}#t=${Math.floor(startAt)}` : video.videoUrl}
								controls
								autoPlay
								playsInline
								className='h-full w-full object-cover'
							/>
						)}
					</div>
					<div className='min-w-0'>
						<div className='flex items-start justify-between gap-3'>
							<h4 className='font-display text-[15px] font-semibold'>{title}</h4>
							<button type='button' onClick={onClose} aria-label={t('filters.close')} className='rounded-lg p-1 text-text-2 hover:text-text'>
								<X size={16} />
							</button>
						</div>
						{video.answer && (
							<>
								<p className='mt-3 font-mono text-[10.5px] uppercase tracking-wider text-text-2'>{t('candidate.coployProfile.transcript')}</p>
								<div className='mt-1.5 max-h-52 overflow-y-auto border-l-2 border-border pl-3 text-[13px] leading-relaxed text-text-2'>{video.answer}</div>
							</>
						)}
						{video.feedback && (
							<>
								<p className='mt-4 font-mono text-[10.5px] uppercase tracking-wider text-text-2'>{t('candidate.coployProfile.reading')}</p>
								<p className='mt-1.5 text-[13px] leading-relaxed'>{video.feedback}</p>
							</>
						)}
						{video.strengths.length > 0 && (
							<>
								<p className='mt-4 font-mono text-[10.5px] uppercase tracking-wider text-text-2'>{t('candidate.coployProfile.strengths')}</p>
								<ul className='mt-1.5 list-disc space-y-1 pl-4 text-[13px] text-text-2'>
									{video.strengths.map((strength, index) => <li key={index}>{strength}</li>)}
								</ul>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
