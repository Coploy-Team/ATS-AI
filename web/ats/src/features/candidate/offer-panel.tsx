import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Send, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { MoneyInput } from '@/ui/money-input'

interface Offer {
	id: string
	salaryMinor: number
	currency: string
	contractType?: string | null
	startDate?: string | null
	status: string
	declineReason?: string | null
}

/** Centavos → "R$ 8.000,00". O resto do sistema também guarda dinheiro assim. */
function formatMoney(minor: number, currency: string): string {
	return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(minor / 100)
}

/**
 * Oferta (V2-402).
 *
 * O funil terminava em "aprovado" e a contratação acontecia fora — por isso o
 * dado de quem foi contratado nunca fechava. A oferta nasce em RASCUNHO de
 * propósito: salário errado num e-mail enviado não se desfaz.
 */
export function OfferPanel({ jobId, candidateId }: { jobId: string; candidateId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()

	const { data } = empresa.useGetCompaniesJobsJobIdCandidatesCandidateIdOffers(jobId, candidateId)
	const create = empresa.usePostCompaniesJobsJobIdCandidatesCandidateIdOffers()
	const send = empresa.usePostCompaniesOffersOfferIdSend()
	const respond = empresa.usePatchCompaniesOffersOfferId()

	const offers = ((data?.data as { offers?: Offer[] } | undefined)?.offers ?? []) as Offer[]
	const open = offers.find((offer) => offer.status === 'draft' || offer.status === 'sent')

	const [salaryMinor, setSalaryMinor] = useState<number | null>(null)
	const [contractType, setContractType] = useState('CLT')
	const [startDate, setStartDate] = useState('')
	const [declineReason, setDeclineReason] = useState('')
	const [error, setError] = useState<string | null>(null)

	async function submit() {
		setError(null)
		const value = salaryMinor
		if (!value) {
			setError(t('offer.salaryRequired'))
			return
		}
		try {
			await create.mutateAsync({
				jobId,
				candidateId,
				data: {
						// o campo já entrega centavos — multiplicar de novo era o bug da casa a mais
					salaryMinor: value,
					currency: 'BRL',
					contractType,
					startDate: startDate || null,
				},
			})
			setSalaryMinor(null)
			await queryClient.invalidateQueries()
		} catch {
			setError(t('offer.failed'))
		}
	}

	async function act(action: 'accepted' | 'declined' | 'cancelled') {
		if (!open) return
		setError(null)
		if (action === 'declined' && !declineReason.trim()) {
			setError(t('offer.reasonRequired'))
			return
		}
		try {
			await respond.mutateAsync({
				offerId: open.id,
				data: { action, declineReason: declineReason.trim() || null },
			})
			setDeclineReason('')
			await queryClient.invalidateQueries()
		} catch {
			setError(t('offer.failed'))
		}
	}

	return (
		<section className='rounded-xl border border-border bg-card'>
			<header className='flex items-center gap-2 border-b border-border-soft px-4 py-2.5'>
				<BadgeCheck size={14} className='shrink-0 text-text-2' />
				<h2 className='flex-1 text-[13px] font-medium'>{t('offer.title')}</h2>
				{open && (
					<span
						className={cn(
							'rounded-md border px-1.5 py-0.5 text-[11px]',
							open.status === 'sent'
								? 'border-lime-mid text-lime-fg'
								: 'border-border text-text-2',
						)}
					>
						{t(`offer.status.${open.status}`)}
					</span>
				)}
			</header>

			<div className='flex flex-col gap-3 p-4'>
				{open ? (
					<>
						<p className='text-[13px]'>
							<span className='font-num font-medium'>
								{formatMoney(open.salaryMinor, open.currency)}
							</span>
							{open.contractType && <span className='text-text-2'> · {open.contractType}</span>}
							{open.startDate && (
								<span className='text-text-2'>
									{' '}
									· {new Date(open.startDate).toLocaleDateString()}
								</span>
							)}
						</p>

						{open.status === 'draft' ? (
							<div className='flex flex-wrap gap-2'>
								<Button
									onClick={() => void send.mutateAsync({ offerId: open.id }).then(() => queryClient.invalidateQueries())}
									disabled={send.isPending}
								>
									<Send size={13} /> {t('offer.send')}
								</Button>
								<Button variant='secondary' onClick={() => void act('cancelled')}>
									<X size={13} /> {t('offer.cancel')}
								</Button>
							</div>
						) : (
							<div className='flex flex-col gap-2'>
								<p className='text-[12px] text-text-2'>{t('offer.awaiting')}</p>
								<input
									value={declineReason}
									onChange={(event) => setDeclineReason(event.target.value)}
									placeholder={t('offer.declineReasonPlaceholder')}
									className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								/>
								<div className='flex flex-wrap gap-2'>
									<Button onClick={() => void act('accepted')}>{t('offer.accepted')}</Button>
									<Button variant='secondary' onClick={() => void act('declined')}>
										{t('offer.declined')}
									</Button>
								</div>
							</div>
						)}
					</>
				) : (
					<>
						<div className='grid gap-2 sm:grid-cols-3'>
							<MoneyInput
								valueMinor={salaryMinor}
								onChange={setSalaryMinor}
								placeholder={t('offer.salaryPlaceholder')}
								aria-label={t('offer.salaryPlaceholder')}
							/>
							<input
								value={contractType}
								onChange={(event) => setContractType(event.target.value)}
								placeholder={t('offer.contractPlaceholder')}
								className='h-9 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
							/>
							<input
								type='date'
								value={startDate}
								onChange={(event) => setStartDate(event.target.value)}
								className='h-9 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
							/>
						</div>
						<div>
							<Button onClick={() => void submit()} disabled={create.isPending}>
								{t('offer.create')}
							</Button>
						</div>
					</>
				)}

				{error && <p className='text-[12px] text-danger'>{error}</p>}

				{/* histórico curto: recusa anterior explica por que a próxima mudou */}
				{offers.filter((offer) => !['draft', 'sent'].includes(offer.status)).length > 0 && (
					<ul className='flex flex-col gap-1 border-t border-border-soft pt-2.5'>
						{offers
							.filter((offer) => !['draft', 'sent'].includes(offer.status))
							.map((offer) => (
								<li key={offer.id} className='text-[11.5px] text-muted'>
									{t(`offer.status.${offer.status}`)} ·{' '}
									{formatMoney(offer.salaryMinor, offer.currency)}
									{offer.declineReason && <span> — {offer.declineReason}</span>}
								</li>
							))}
					</ul>
				)}
			</div>
		</section>
	)
}
