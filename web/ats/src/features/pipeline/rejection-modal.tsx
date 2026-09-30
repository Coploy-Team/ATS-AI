import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

export interface RejectionPayload {
	reasonCode: string
	note?: string
	feedbackMessage?: string
}

/**
 * Modal ÚNICO de reprovação — o mesmo para um candidato ou para seleção em
 * massa (aceite do TOS-029: reprovar em ≤2 cliques a partir do card, sem
 * fluxos diferentes pra single e bulk).
 *
 * A taxonomia vem do contrato (`/companies/rejection-reasons`), não de uma
 * cópia no cliente: o código é PERSISTIDO e governa o que o candidato vê.
 */
/** O texto atual ainda é uma das sugestões (ou seja: ninguém o editou). */
function isSuggestion(
	value: string,
	reasons: Array<{ code: string }>,
	t: (key: string, options?: Record<string, unknown>) => string,
): boolean {
	const current = value.trim()
	return reasons.some((r) => t(`reject.templates.${r.code}`, { defaultValue: '' }).trim() === current)
}

export function RejectionModal({
	open,
	count,
	onCancel,
	onConfirm,
	submitting,
}: {
	open: boolean
	count: number
	onCancel: () => void
	onConfirm: (payload: RejectionPayload) => void
	submitting: boolean
}) {
	const { t } = useTranslation()
	const { data } = empresa.useGetCompaniesRejectionReasons({ query: { enabled: open } })
	const reasons = data?.data.reasons ?? []

	const [reasonCode, setReasonCode] = useState('')
	const [note, setNote] = useState('')
	const [feedback, setFeedback] = useState('')

	useEffect(() => {
		if (open) {
			setReasonCode('')
			setNote('')
			setFeedback('')
		}
	}, [open])

	/*
	 * A mensagem ao candidato é OBRIGATÓRIA — o servidor recusa reprovação sem
	 * ela, e é essa a regra anti-ghosting do produto. O rótulo dizia "(opcional)"
	 * e a reprovação estourava com erro de API: a tela mentia sobre a regra.
	 *
	 * Em vez de só marcar como obrigatório e empurrar redação para cima do
	 * recrutador, cada motivo traz um texto pronto. Obrigatório vira um clique,
	 * e quem quiser personaliza — que é o oposto de exigir e ser ignorado.
	 */
	function chooseReason(code: string) {
		setReasonCode(code)
		const suggestion = code ? t(`reject.templates.${code}`, { defaultValue: '' }) : ''
		// só sobrescreve o que ainda é sugestão: texto escrito à mão sobrevive
		const untouched = !feedback.trim() || isSuggestion(feedback, reasons, t)
		if (suggestion && untouched) setFeedback(suggestion)
	}

	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [open, onCancel])

	if (!open) return null

	const reason = reasons.find((r) => r.code === reasonCode)
	const noteRequired = reason?.requiresNote === true
	const canConfirm =
		Boolean(reasonCode) &&
		(!noteRequired || note.trim().length > 0) &&
		feedback.trim().length > 0

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
							{count > 1 ? t('reject.titleMany', { count }) : t('reject.title')}
						</h2>
						<p className='mt-0.5 text-[12px] text-text-2'>{t('reject.subtitle')}</p>
					</div>
					<button
						onClick={onCancel}
						className='text-muted transition-colors hover:text-text'
						aria-label={t('filters.close')}
					>
						<X size={16} />
					</button>
				</div>

				<div className='flex flex-col gap-3'>
					<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
						{t('reject.reason')}
						<select
							value={reasonCode}
							onChange={(e) => chooseReason(e.target.value)}
							className='h-9 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
						>
							<option value=''>{t('reject.chooseReason')}</option>
							{reasons.map((r) => (
								<option key={r.code} value={r.code}>
									{r.label}
								</option>
							))}
						</select>
					</label>

					{/* nota interna: obrigatória em alguns motivos (ex.: "Outro") */}
					<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
						<span>
							{t('reject.note')}{' '}
							<span className='font-normal text-muted'>
								{noteRequired ? t('reject.noteRequired') : t('reject.noteInternal')}
							</span>
						</span>
						<textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={2}
							className='rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-text'
						/>
					</label>

					<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
						<span>
							{t('reject.feedback')}{' '}
							<span className='font-normal text-muted'>{t('reject.feedbackRequired')}</span>
						</span>
						<textarea
							value={feedback}
							onChange={(e) => setFeedback(e.target.value)}
							rows={3}
							placeholder={t('reject.feedbackPlaceholder')}
							className='rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-text'
						/>
						{/* dizer que o texto SAI daqui — é e-mail, não anotação */}
						<span className='text-[11px] font-normal text-muted'>{t('reject.feedbackSends')}</span>
					</label>
				</div>

				<div className='mt-5 flex items-center justify-end gap-2'>
					<Button variant='secondary' onClick={onCancel} disabled={submitting}>
						{t('filters.cancel')}
					</Button>
					<Button
						variant='danger'
						disabled={!canConfirm || submitting}
						onClick={() =>
							onConfirm({
								reasonCode,
								note: note.trim() || undefined,
								feedbackMessage: feedback.trim() || undefined,
							})
						}
						className={cn(!canConfirm && 'cursor-not-allowed')}
					>
						{submitting ? t('reject.submitting') : t('reject.confirm')}
					</Button>
				</div>
			</div>
		</div>
	)
}
