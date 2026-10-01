import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Video, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { Button } from '@/ui/button'

type InviteResult = {
	invited: number
	sent: number
	results: Array<{ candidateId: string; status: string; reason?: string }>
}

/**
 * Convite para a entrevista IA — a ação primária do Pipeline.
 *
 * O recado do recrutador é opcional de propósito: exigir texto transformaria
 * a ação principal do produto num formulário, e a maioria dos convites é o
 * mesmo convite. Quem quiser personalizar, personaliza.
 *
 * O resultado é por candidato porque mover e notificar podem divergir — o
 * servidor move sempre e o e-mail é best-effort. Mostrar só "convidado" quando
 * três ficaram sem e-mail seria mentira útil pra ninguém.
 */
export function InviteModal({
	open,
	jobId,
	candidateIds,
	onClose,
}: {
	open: boolean
	jobId: string
	candidateIds: string[]
	onClose: () => void
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const invite = empresa.usePostCompaniesJobsJobIdInviteInterview()
	// decisão 2 (martelo 2026-08-23): vaga sem pergunta não convida — o modal
	// explica e aponta pra edição em vez de deixar o servidor recusar depois
	const { data: jobData } = empresa.useGetCompaniesJobsSlug(jobId, {
		query: { enabled: open },
	})
	const jobForGate = jobData?.status === 200 ? (jobData.data as {
		jobQuestions?: unknown[]
		additionalQuestions?: unknown[]
	}) : null
	const questionCount = jobForGate
		? (jobForGate.jobQuestions?.length ?? 0) + (jobForGate.additionalQuestions?.length ?? 0)
		: null
	const [message, setMessage] = useState('')
	const [result, setResult] = useState<InviteResult | null>(null)
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		if (open) {
			setMessage('')
			setResult(null)
			setFailed(false)
		}
	}, [open])

	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [open, onClose])

	if (!open) return null

	if (questionCount === 0) {
		return (
			<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4' onClick={onClose}>
				<div
					className='w-full max-w-md rounded-xl border border-border bg-card p-5'
					onClick={(e) => e.stopPropagation()}
				>
					<div className='mb-2 flex items-center gap-2'>
						<AlertCircle size={16} className='text-amber-500' />
						<h3 className='text-[15px] font-semibold'>{t('invite.noQuestionsTitle')}</h3>
					</div>
					<p className='text-[13px] leading-relaxed text-text-2'>{t('invite.noQuestionsBody')}</p>
					<div className='mt-4 flex justify-end gap-2'>
						<Button variant='secondary' onClick={onClose}>{t('filters.cancel')}</Button>
						<Button onClick={() => { window.location.href = `/vagas/${jobId}/editar` }}>
							{t('invite.addQuestions')}
						</Button>
					</div>
				</div>
			</div>
		)
	}

	async function submit() {
		setFailed(false)
		try {
			// a API aceita no máximo 50 por chamada — fatiar é nossa responsabilidade
			const merged: InviteResult = { invited: 0, sent: 0, results: [] }
			for (let i = 0; i < candidateIds.length; i += 50) {
				const response = await invite.mutateAsync({
					jobId,
					data: {
						candidateIds: candidateIds.slice(i, i + 50),
						...(message.trim() ? { message: message.trim() } : {}),
					},
				})
				merged.invited += response.data.invited
				merged.sent += response.data.sent
				merged.results.push(...response.data.results)
			}
			setResult(merged)
			await queryClient.invalidateQueries({
				queryKey: empresa.getGetCompaniesJobsJobIdCandidatesQueryKey(jobId, { limit: '200' }),
			})
			await queryClient.invalidateQueries({
				queryKey: empresa.getGetCompaniesJobsQueryKey(),
				exact: false,
			})
		} catch {
			setFailed(true)
		}
	}

	const withoutEmail = result?.results.filter((r) => r.status === 'moved_without_email') ?? []
	const skipped = result?.results.filter((r) => r.status === 'skipped') ?? []

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
			<div
				role='dialog'
				aria-modal='true'
				className='w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-pop)]'
			>
				<div className='mb-4 flex items-start justify-between gap-3'>
					<div>
						<h2 className='font-display text-[15px] font-semibold'>
							{t('invite.title', { count: candidateIds.length })}
						</h2>
						<p className='mt-0.5 text-[12px] text-text-2'>{t('invite.subtitle')}</p>
					</div>
					<button
						onClick={onClose}
						className='text-muted transition-colors hover:text-text'
						aria-label={t('filters.close')}
					>
						<X size={16} />
					</button>
				</div>

				{result ? (
					<div className='flex flex-col gap-2'>
						<p className='inline-flex items-center gap-2 rounded-lg border border-lime-mid bg-lime-soft px-3 py-2 text-[13px] text-lime-fg'>
							<Check size={14} /> {t('invite.done', { count: result.sent })}
						</p>
						{withoutEmail.length > 0 && (
							<p className='inline-flex items-start gap-2 rounded-lg border border-border bg-amber-soft px-3 py-2 text-[12px] text-amber'>
								<AlertCircle size={14} className='mt-px shrink-0' />
								{t('invite.movedWithoutEmail', { count: withoutEmail.length })}
							</p>
						)}
						{skipped.length > 0 && (
							<p className='rounded-lg border border-border px-3 py-2 text-[12px] text-muted'>
								{t('invite.skipped', { count: skipped.length })}
							</p>
						)}
						<div className='mt-3 flex justify-end'>
							<Button onClick={onClose}>{t('invite.close')}</Button>
						</div>
					</div>
				) : (
					<>
						<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
							<span>
								{t('invite.message')}{' '}
								<span className='font-normal text-muted'>{t('invite.messageHint')}</span>
							</span>
							<textarea
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								rows={3}
								maxLength={2000}
								placeholder={t('invite.messagePlaceholder')}
								className='rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-text'
							/>
						</label>

						{failed && (
							<p className='mt-3 rounded-lg border border-border bg-danger-soft px-3 py-2 text-[12px] text-danger'>
								{t('invite.error')}
							</p>
						)}

						<div className='mt-5 flex items-center justify-end gap-2'>
							<Button variant='secondary' onClick={onClose} disabled={invite.isPending}>
								{t('filters.cancel')}
							</Button>
							<Button onClick={() => void submit()} disabled={invite.isPending}>
								<Video size={13} />
								{invite.isPending ? t('invite.sending') : t('invite.confirm')}
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	)
}
