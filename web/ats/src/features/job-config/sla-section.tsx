import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

/** Atalhos que cobrem a decisão real; o resto é digitado. */
const PRESETS = [24, 48, 72, 168]

/**
 * Régua de resposta ao candidato (TOS-026) — o diferencial anti-ghosting.
 *
 * Vaga sem régua não é "vaga com SLA zero": é vaga que nunca decidiu. Por isso
 * o estado inicial é um convite com o benefício ("ninguém fica sem resposta"),
 * e não um campo vazio — regra de adoção §7.
 */
export function SlaSection({
	jobId,
	job,
}: {
	jobId: string
	job?: { feedbackSlaHours?: number | null; antiGhostingEnabled?: boolean | null }
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const patch = empresa.usePatchCompaniesJobsJobId()

	const configured = typeof job?.feedbackSlaHours === 'number' && job.feedbackSlaHours > 0
	const [hours, setHours] = useState<number>(job?.feedbackSlaHours ?? 48)
	const [saved, setSaved] = useState(false)
	const [error, setError] = useState(false)

	useEffect(() => {
		if (typeof job?.feedbackSlaHours === 'number') setHours(job.feedbackSlaHours)
	}, [job?.feedbackSlaHours])

	async function save(next: { feedbackSlaHours?: number | null; antiGhostingEnabled?: boolean }) {
		setError(false)
		setSaved(false)
		try {
			await patch.mutateAsync({ jobId, data: next as never })
			await queryClient.invalidateQueries()
			setSaved(true)
		} catch {
			setError(true)
		}
	}

	return (
		<section className='rounded-xl border border-border bg-card p-4'>
			<header className='mb-3'>
				<h2 className='font-display text-[14px] font-semibold'>{t('jobConfig.slaTitle')}</h2>
				<p className='mt-0.5 text-[12px] text-text-2'>{t('jobConfig.slaDescription')}</p>
			</header>

			{!configured && (
				<p className='mb-3 rounded-lg border border-lime-mid bg-lime-soft px-3 py-2 text-[12px] text-text'>
					{t('jobConfig.slaInvite')}
				</p>
			)}

			<div className='flex flex-wrap items-center gap-1.5'>
				{PRESETS.map((preset) => (
					<button
						key={preset}
						onClick={() => {
							setHours(preset)
							void save({ feedbackSlaHours: preset, antiGhostingEnabled: true })
						}}
						disabled={patch.isPending}
						className={cn(
							'h-8 rounded-lg border px-3 text-[12.5px] transition-colors',
							hours === preset && configured
								? 'border-lime bg-lime-soft text-lime-fg'
								: 'border-border text-text-2 hover:bg-hover hover:text-text',
						)}
					>
						{t('jobConfig.slaPreset', { hours: preset })}
					</button>
				))}

				<span className='mx-1 h-5 w-px bg-border' />

				<input
					type='number'
					min={1}
					max={720}
					value={hours}
					onChange={(e) => setHours(Number(e.target.value))}
					className='font-num h-8 w-20 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text'
				/>
				<span className='text-[12px] text-muted'>{t('jobConfig.slaHours')}</span>

				<Button
					variant='secondary'
					size='sm'
					disabled={patch.isPending || hours < 1}
					onClick={() => void save({ feedbackSlaHours: hours, antiGhostingEnabled: true })}
				>
					{patch.isPending ? t('jobConfig.saving') : t('jobConfig.save')}
				</Button>

				{saved && (
					<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
						<Check size={13} /> {t('jobConfig.saved')}
					</span>
				)}
			</div>

			{configured && (
				<button
					onClick={() => void save({ feedbackSlaHours: null, antiGhostingEnabled: false })}
					disabled={patch.isPending}
					className='mt-3 text-[12px] text-muted underline-offset-2 transition-colors hover:text-text hover:underline'
				>
					{t('jobConfig.slaRemove')}
				</button>
			)}

			{error && <p className='mt-2 text-[12px] text-danger'>{t('jobConfig.saveError')}</p>}
		</section>
	)
}
