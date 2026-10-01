import { useQueryClient } from '@tanstack/react-query'
import { Bot, CalendarClock, CalendarPlus, MessageSquareText, Plus, Send, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { RequireCapability } from '@/components/require-capability'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card } from '@/ui/page'
import { Segmented } from '@/ui/segmented'

/**
 * Conversa e retorno com o candidato (OTS 0.3, F7).
 *
 * A empresa propõe horários para uma conversa com gente e escreve o retorno
 * do processo. O candidato escolhe o horário pela área dele ou pelo
 * assistente conectado (ChatGPT, Claude) — o mesmo protocolo. O link da
 * reunião vai com a proposta, mas o candidato só o vê depois de confirmar.
 */

type SchedulesResponse = Awaited<ReturnType<typeof empresa.getCompaniesJobsJobIdCandidatesCandidateIdSchedules>>
type Schedule = Extract<SchedulesResponse, { status: 200 }>['data']['schedules'][number]
type FeedbackResponse = Awaited<ReturnType<typeof empresa.getCompaniesJobsJobIdCandidatesCandidateIdFeedback>>
type Feedback = Extract<FeedbackResponse, { status: 200 }>['data']['feedback'][number]

const FORMATS = ['video_call', 'phone', 'onsite'] as const
const DURATIONS = [30, 45, 60, 90]
const MANUAL_STAGES = ['in_review', 'advanced', 'interview_scheduled', 'hired', 'received'] as const

const browserTimezone = (() => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
	} catch {
		return 'America/Sao_Paulo'
	}
})()

function formatWhen(iso: string, timezone: string, locale: string) {
	try {
		return new Intl.DateTimeFormat(locale, {
			weekday: 'short',
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: timezone,
		}).format(new Date(iso))
	} catch {
		return iso
	}
}

/** Valor de `datetime-local` (hora do navegador) → ISO com offset. */
function localToIso(value: string): string | null {
	if (!value) return null
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const inputClass = 'w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px] text-text'
const labelClass = 'font-mono text-[10.5px] uppercase tracking-wider text-text-2'

const STATUS_TONE: Record<Schedule['status'], string> = {
	proposed: 'border-border text-text-2',
	confirmed: 'border-lime-mid bg-lime-soft text-lime-fg',
	declined: 'border-border text-danger',
	expired: 'border-border text-muted',
	cancelled: 'border-border text-muted',
}

export function ProcessPanel({
	jobId,
	candidateId,
	candidateName,
	rejected,
}: {
	jobId: string
	candidateId: string
	candidateName: string
	rejected: boolean
}) {
	const { t, i18n } = useTranslation()
	const locale = i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR'
	const firstName = candidateName.split(' ')[0] || candidateName
	const queryClient = useQueryClient()

	const schedulesQuery = empresa.useGetCompaniesJobsJobIdCandidatesCandidateIdSchedules(jobId, candidateId)
	const feedbackQuery = empresa.useGetCompaniesJobsJobIdCandidatesCandidateIdFeedback(jobId, candidateId)
	const schedules = schedulesQuery.data?.status === 200 ? schedulesQuery.data.data.schedules : []
	const feedback = feedbackQuery.data?.status === 200 ? feedbackQuery.data.data.feedback : []

	const current = schedules.find((schedule) => schedule.status !== 'cancelled') ?? null
	const [proposing, setProposing] = useState(false)
	const [writing, setWriting] = useState(false)

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: empresa.getGetCompaniesJobsJobIdCandidatesCandidateIdSchedulesQueryKey(jobId, candidateId) }),
			queryClient.invalidateQueries({ queryKey: empresa.getGetCompaniesJobsJobIdCandidatesCandidateIdFeedbackQueryKey(jobId, candidateId) }),
		])
	}

	return (
		<Card>
			<p className='font-mono text-[11px] uppercase tracking-[0.12em] text-lime-fg'>{t('candidate.process.eyebrow')}</p>
			<h3 className='mt-1 font-display text-[17px] font-bold'>{t('candidate.process.title', { name: firstName })}</h3>
			<p className='mt-1 text-[12.5px] text-text-2'>{t('candidate.process.subtitle')}</p>

			{/* ── Entrevista com o time ── */}
			<div className='mt-4 border-t border-border pt-4'>
				<div className='flex flex-wrap items-center justify-between gap-2'>
					<p className='inline-flex items-center gap-1.5 text-[13px] font-semibold'>
						<CalendarClock size={14} className='text-text-2' />
						{t('candidate.process.scheduleTitle')}
					</p>
					{!rejected && !proposing && (
						<RequireCapability capability='candidate:move'>
							<Button onClick={() => setProposing(true)}>
								<CalendarPlus size={13} />
								{current && ['proposed', 'confirmed'].includes(current.status)
									? t('candidate.process.reschedule')
									: t('candidate.process.propose')}
							</Button>
						</RequireCapability>
					)}
				</div>

				{current && !proposing && (
					<ScheduleSummary schedule={current} locale={locale} jobId={jobId} candidateId={candidateId} onChanged={refresh} />
				)}
				{!current && !proposing && <p className='mt-2 text-[12.5px] text-text-2'>{t('candidate.process.noSchedule')}</p>}
				{proposing && (
					<ProposeForm
						jobId={jobId}
						candidateId={candidateId}
						replacing={Boolean(current && ['proposed', 'confirmed'].includes(current.status))}
						onDone={async () => {
							setProposing(false)
							await refresh()
						}}
						onCancel={() => setProposing(false)}
					/>
				)}
			</div>

			{/* ── Retorno ao candidato ── */}
			<div className='mt-4 border-t border-border pt-4'>
				<div className='flex flex-wrap items-center justify-between gap-2'>
					<p className='inline-flex items-center gap-1.5 text-[13px] font-semibold'>
						<MessageSquareText size={14} className='text-text-2' />
						{t('candidate.process.feedbackTitle')}
					</p>
					{!rejected && !writing && (
						<RequireCapability capability='candidate:move'>
							<Button onClick={() => setWriting(true)}>
								<Send size={13} />
								{t('candidate.process.writeFeedback')}
							</Button>
						</RequireCapability>
					)}
				</div>
				{writing && (
					<FeedbackForm
						jobId={jobId}
						candidateId={candidateId}
						onDone={async () => {
							setWriting(false)
							await refresh()
						}}
						onCancel={() => setWriting(false)}
					/>
				)}
				{feedback.length === 0 && !writing ? (
					<p className='mt-2 text-[12.5px] text-text-2'>{t('candidate.process.noFeedback')}</p>
				) : (
					<ol className='mt-3 flex flex-col gap-3'>
						{feedback.map((item) => (
							<FeedbackItem key={item.id} item={item} locale={locale} />
						))}
					</ol>
				)}
				{rejected && <p className='mt-3 text-[11.5px] text-text-2'>{t('candidate.process.rejectedHint')}</p>}
			</div>
		</Card>
	)
}

function ScheduleSummary({
	schedule,
	locale,
	jobId,
	candidateId,
	onChanged,
}: {
	schedule: Schedule
	locale: string
	jobId: string
	candidateId: string
	onChanged: () => Promise<void>
}) {
	const { t } = useTranslation()
	const cancel = empresa.usePostCompaniesJobsJobIdCandidatesCandidateIdSchedulesScheduleIdCancel()
	const open = schedule.status === 'proposed' || schedule.status === 'confirmed'

	return (
		<div className='mt-3 rounded-lg border border-border p-3'>
			<div className='flex flex-wrap items-center gap-2 text-[12px]'>
				<span className={cn('rounded-full border px-2 py-0.5 font-medium', STATUS_TONE[schedule.status])}>
					{t(`candidate.process.status.${schedule.status}`)}
				</span>
				<span className='text-text-2'>
					{t(`candidate.process.format.${schedule.format}`)} · {schedule.durationMinutes} min · {schedule.timezone}
				</span>
				{schedule.respondedVia === 'agent' && (
					<span className='inline-flex items-center gap-1 text-text-2' title={t('candidate.process.viaAgentHint')}>
						<Bot size={12} /> {t('candidate.process.viaAgent')}
					</span>
				)}
			</div>

			{schedule.status === 'confirmed' && schedule.confirmedSlot ? (
				<p className='mt-2 font-display text-[15px] font-semibold tabular-nums'>
					{formatWhen(schedule.confirmedSlot.start, schedule.timezone, locale)}
				</p>
			) : (
				<ul className='mt-2 flex flex-wrap gap-1.5'>
					{schedule.slots.map((slot) => (
						<li key={slot.start} className='rounded-md border border-border px-2 py-0.5 text-[12px] tabular-nums text-text-2'>
							{formatWhen(slot.start, schedule.timezone, locale)}
						</li>
					))}
				</ul>
			)}

			{schedule.status === 'declined' && (
				<p className='mt-2 text-[12.5px] text-text-2'>
					{t(`candidate.process.decline.${schedule.declineReason ?? 'other'}`)}
					{schedule.declineNote ? ` — “${schedule.declineNote}”` : ''}
				</p>
			)}
			{schedule.status === 'proposed' && <p className='mt-2 text-[11.5px] text-text-2'>{t('candidate.process.waiting')}</p>}
			{schedule.status === 'expired' && <p className='mt-2 text-[11.5px] text-text-2'>{t('candidate.process.expiredHint')}</p>}
			{schedule.joinDetails?.meetingUrl && (
				<p className='mt-2 truncate text-[12px] text-text-2'>
					{t('candidate.process.link')}: <a href={schedule.joinDetails.meetingUrl} target='_blank' rel='noopener noreferrer' className='text-lime-fg hover:underline'>{schedule.joinDetails.meetingUrl}</a>
				</p>
			)}
			{schedule.joinDetails?.address && (
				<p className='mt-1 text-[12px] text-text-2'>{t('candidate.process.address')}: {schedule.joinDetails.address}</p>
			)}

			{open && (
				<RequireCapability capability='candidate:move'>
					<button
						type='button'
						disabled={cancel.isPending}
						onClick={async () => {
							await cancel.mutateAsync({ jobId, candidateId, scheduleId: schedule.id })
							await onChanged()
						}}
						className='mt-2 text-[12px] text-text-2 underline-offset-2 hover:text-danger hover:underline'
					>
						{t('candidate.process.cancel')}
					</button>
				</RequireCapability>
			)}
		</div>
	)
}

function ProposeForm({
	jobId,
	candidateId,
	replacing,
	onDone,
	onCancel,
}: {
	jobId: string
	candidateId: string
	replacing: boolean
	onDone: () => Promise<void>
	onCancel: () => void
}) {
	const { t } = useTranslation()
	const propose = empresa.usePostCompaniesJobsJobIdCandidatesCandidateIdSchedules()
	const [format, setFormat] = useState<(typeof FORMATS)[number]>('video_call')
	const [duration, setDuration] = useState(45)
	const [slots, setSlots] = useState<string[]>(['', '', ''])
	const [meetingUrl, setMeetingUrl] = useState('')
	const [address, setAddress] = useState('')
	const [note, setNote] = useState('')
	const [error, setError] = useState<string | null>(null)

	const starts = useMemo(() => slots.map(localToIso).filter((value): value is string => Boolean(value)), [slots])
	const minLocal = useMemo(() => {
		const date = new Date(Date.now() + 60 * 60_000)
		date.setSeconds(0, 0)
		return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
	}, [])

	async function submit() {
		setError(null)
		if (starts.length === 0) {
			setError(t('candidate.process.needSlot'))
			return
		}
		try {
			const response = await propose.mutateAsync({
				jobId,
				candidateId,
				data: {
					format,
					durationMinutes: duration,
					timezone: browserTimezone,
					slots: starts.map((start) => ({ start })),
					note: note.trim() || null,
					joinDetails:
						format === 'onsite'
							? { address: address.trim() || null }
							: format === 'video_call'
								? { meetingUrl: meetingUrl.trim() || null }
								: null,
				},
			})
			if (response.status !== 201) {
				setError((response.data as { message?: string }).message ?? t('candidate.process.proposeError'))
				return
			}
			await onDone()
		} catch {
			setError(t('candidate.process.proposeError'))
		}
	}

	return (
		<div className='mt-3 flex flex-col gap-3 rounded-lg border border-border p-3'>
			{replacing && <p className='text-[11.5px] text-text-2'>{t('candidate.process.replaceHint')}</p>}
			<div className='flex flex-wrap items-center gap-3'>
				<Segmented
					options={FORMATS.map((value) => ({ value, label: t(`candidate.process.format.${value}`) }))}
					value={format}
					onChange={(value) => setFormat(value as (typeof FORMATS)[number])}
				/>
				<Segmented
					options={DURATIONS.map((value) => ({ value: String(value), label: `${value} min` }))}
					value={String(duration)}
					onChange={(value) => setDuration(Number(value))}
				/>
			</div>

			<div>
				<p className={labelClass}>{t('candidate.process.slots', { timezone: browserTimezone })}</p>
				<div className='mt-1.5 grid gap-2 sm:grid-cols-2'>
					{slots.map((value, index) => (
						<div key={index} className='flex items-center gap-1.5'>
							<input
								type='datetime-local'
								value={value}
								min={minLocal}
								onChange={(event) => setSlots(slots.map((item, i) => (i === index ? event.target.value : item)))}
								aria-label={t('candidate.process.slotLabel', { n: index + 1 })}
								className={inputClass}
							/>
							{slots.length > 1 && (
								<button
									type='button'
									onClick={() => setSlots(slots.filter((_, i) => i !== index))}
									aria-label={t('candidate.process.removeSlot')}
									className='rounded-md p-1 text-text-2 hover:text-text'
								>
									<X size={14} />
								</button>
							)}
						</div>
					))}
				</div>
				{slots.length < 20 && (
					<button type='button' onClick={() => setSlots([...slots, ''])} className='mt-2 inline-flex items-center gap-1 text-[12px] text-text-2 hover:text-text'>
						<Plus size={12} /> {t('candidate.process.addSlot')}
					</button>
				)}
			</div>

			{format === 'video_call' && (
				<label className='flex flex-col gap-1'>
					<span className={labelClass}>{t('candidate.process.meetingUrl')}</span>
					<input value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} inputMode='url' placeholder='https://meet.google.com/…' className={inputClass} />
					<span className='text-[11px] text-text-2'>{t('candidate.process.linkHint')}</span>
				</label>
			)}
			{format === 'onsite' && (
				<label className='flex flex-col gap-1'>
					<span className={labelClass}>{t('candidate.process.address')}</span>
					<input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={500} className={inputClass} />
				</label>
			)}
			<label className='flex flex-col gap-1'>
				<span className={labelClass}>{t('candidate.process.note')}</span>
				<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} placeholder={t('candidate.process.notePlaceholder')} className={inputClass} />
			</label>

			{error && <p className='text-[12px] text-danger'>{error}</p>}
			<div className='flex flex-wrap gap-2'>
				<Button variant='primary' onClick={() => void submit()} disabled={propose.isPending}>
					<CalendarPlus size={13} /> {t('candidate.process.send')}
				</Button>
				<Button onClick={onCancel}>{t('candidate.process.discard')}</Button>
			</div>
			<p className='text-[11px] text-text-2'>{t('candidate.process.agentHint')}</p>
		</div>
	)
}

function FeedbackForm({
	jobId,
	candidateId,
	onDone,
	onCancel,
}: {
	jobId: string
	candidateId: string
	onDone: () => Promise<void>
	onCancel: () => void
}) {
	const { t } = useTranslation()
	const send = empresa.usePostCompaniesJobsJobIdCandidatesCandidateIdFeedback()
	const [stage, setStage] = useState<(typeof MANUAL_STAGES)[number]>('in_review')
	const [message, setMessage] = useState('')
	const [nextStep, setNextStep] = useState('')
	const [error, setError] = useState<string | null>(null)

	async function submit() {
		setError(null)
		if (!message.trim()) {
			setError(t('candidate.process.needMessage'))
			return
		}
		try {
			const response = await send.mutateAsync({
				jobId,
				candidateId,
				data: { stage, message: message.trim(), nextStep: nextStep.trim() || null },
			})
			if (response.status !== 201) {
				setError((response.data as { message?: string }).message ?? t('candidate.process.feedbackError'))
				return
			}
			await onDone()
		} catch {
			setError(t('candidate.process.feedbackError'))
		}
	}

	return (
		<div className='mt-3 flex flex-col gap-3 rounded-lg border border-border p-3'>
			<label className='flex flex-col gap-1'>
				<span className={labelClass}>{t('candidate.process.stageLabel')}</span>
				<select value={stage} onChange={(event) => setStage(event.target.value as (typeof MANUAL_STAGES)[number])} className={inputClass}>
					{MANUAL_STAGES.map((value) => (
						<option key={value} value={value}>{t(`candidate.process.stage.${value}`)}</option>
					))}
				</select>
			</label>
			<label className='flex flex-col gap-1'>
				<span className={labelClass}>{t('candidate.process.message')}</span>
				<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={4000} placeholder={t('candidate.process.messagePlaceholder')} className={inputClass} />
			</label>
			<label className='flex flex-col gap-1'>
				<span className={labelClass}>{t('candidate.process.nextStep')}</span>
				<input value={nextStep} onChange={(event) => setNextStep(event.target.value)} maxLength={1000} className={inputClass} />
			</label>
			{error && <p className='text-[12px] text-danger'>{error}</p>}
			<div className='flex flex-wrap gap-2'>
				<Button variant='primary' onClick={() => void submit()} disabled={send.isPending}>
					<Send size={13} /> {t('candidate.process.sendFeedback')}
				</Button>
				<Button onClick={onCancel}>{t('candidate.process.discard')}</Button>
			</div>
			<p className='text-[11px] text-text-2'>{t('candidate.process.feedbackHint')}</p>
		</div>
	)
}

function FeedbackItem({ item, locale }: { item: Feedback; locale: string }) {
	const { t } = useTranslation()
	return (
		<li className='border-l-2 border-border pl-3'>
			<div className='flex flex-wrap items-center gap-2 text-[11.5px] text-text-2'>
				<span className='rounded-full border border-border px-2 py-0.5 font-medium text-text'>{t(`candidate.process.stage.${item.stage}`)}</span>
				<span className='tabular-nums'>{formatWhen(item.sentAt, Intl.DateTimeFormat().resolvedOptions().timeZone, locale)}</span>
				{item.sentByName && <span>· {item.sentByName}</span>}
				{item.source === 'rejection' && <span>· {t('candidate.process.fromRejection')}</span>}
			</div>
			<p className='mt-1 whitespace-pre-line text-[13px] leading-relaxed'>{item.message}</p>
			{item.nextStep && <p className='mt-1 text-[12px] text-text-2'>{t('candidate.process.nextStep')}: {item.nextStep}</p>}
		</li>
	)
}
