import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'

const INTENTS = ['immediate', 'talent_pool', 'future_pipeline'] as const
type Intent = (typeof INTENTS)[number]

/** Atalhos de frescor. 0 = sem pausa automática. */
const FRESHNESS_PRESETS = [15, 30, 60, 0]

/**
 * Intenção de contratação e frescor da vaga (V2-604, GAP 9).
 *
 * 18–22% das vagas do mercado são ghost job e 3 em 5 candidatos desconfiam.
 * Declarar a intenção não custa nada a quem está contratando de verdade — e é
 * caro para quem não está. Esse desequilíbrio é o produto.
 *
 * A tela **não** trata "banco de talentos" como resposta errada: é uma prática
 * legítima. O que era desonesto é anunciá-la como vaga aberta.
 */
export function HiringIntentSection({
	jobId,
	job,
}: {
	jobId: string
	job?: {
		hiringIntent?: string | null
		freshnessSlaDays?: number | null
		antiGhostingEnabled?: boolean | null
		slaIrregularSince?: string | null
	}
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const patch = empresa.usePatchCompaniesJobsJobId()

	const [saved, setSaved] = useState(false)
	const intent = (job?.hiringIntent ?? null) as Intent | null
	const freshness = job?.freshnessSlaDays ?? null

	// O selo é consequência de comportamento, nunca de plano contratado.
	const verified = job?.antiGhostingEnabled === true && !job?.slaIrregularSince && Boolean(intent)

	async function save(next: Record<string, unknown>) {
		setSaved(false)
		try {
			await patch.mutateAsync({ jobId, data: next as never })
			await queryClient.invalidateQueries()
			setSaved(true)
		} catch {
			/* o estado da vaga permanece; o recrutador tenta de novo */
		}
	}

	return (
		<section className='rounded-xl border border-border bg-card p-4'>
			<header className='mb-3 flex flex-wrap items-start gap-2'>
				<div className='min-w-0 flex-1'>
					<h2 className='font-display text-[14px] font-semibold'>{t('hiringIntent.title')}</h2>
					<p className='mt-0.5 text-[12px] text-text-2'>{t('hiringIntent.description')}</p>
				</div>
				{verified && (
					<span className='inline-flex shrink-0 items-center gap-1 rounded-md border border-lime-mid bg-lime-soft px-1.5 py-0.5 text-[11px] font-medium text-lime-fg'>
						<BadgeCheck size={12} /> {t('hiringIntent.verified')}
					</span>
				)}
			</header>

			<div className='flex flex-col gap-1.5'>
				{INTENTS.map((value) => (
					<button
						key={value}
						onClick={() => void save({ hiringIntent: value })}
						aria-pressed={intent === value}
						className={cn(
							'rounded-lg border px-3 py-2 text-left transition-colors',
							intent === value
								? 'border-lime bg-lime-soft'
								: 'border-border hover:bg-hover',
						)}
					>
						<span
							className={cn(
								'block text-[12.5px] font-medium',
								intent === value && 'text-lime-fg',
							)}
						>
							{t(`hiringIntent.${value}.label`)}
						</span>
						<span className='mt-0.5 block text-[11.5px] text-text-2'>
							{t(`hiringIntent.${value}.hint`)}
						</span>
					</button>
				))}
			</div>

			<div className='mt-4 border-t border-border-soft pt-3'>
				<p className='text-[12px] font-medium'>{t('hiringIntent.freshnessTitle')}</p>
				<p className='mt-0.5 text-[11.5px] text-text-2'>{t('hiringIntent.freshnessHint')}</p>

				<div className='mt-2 flex flex-wrap gap-1.5'>
					{FRESHNESS_PRESETS.map((days) => (
						<button
							key={days}
							onClick={() => void save({ freshnessSlaDays: days || null })}
							aria-pressed={(freshness ?? 0) === days}
							className={cn(
								'rounded-lg border px-2.5 py-1 text-[12px] transition-colors',
								(freshness ?? 0) === days
									? 'border-lime bg-lime-soft font-medium text-lime-fg'
									: 'border-border text-text-2 hover:bg-hover',
							)}
						>
							{days === 0 ? t('hiringIntent.freshnessOff') : t('hiringIntent.days', { count: days })}
						</button>
					))}
				</div>
			</div>

			{saved && (
				<p className='mt-3 inline-flex items-center gap-1 text-[12px] text-lime-fg'>
					<Check size={13} /> {t('jobConfig.saved')}
				</p>
			)}
		</section>
	)
}
