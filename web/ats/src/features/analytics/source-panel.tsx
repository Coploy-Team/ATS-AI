import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Card as Block } from '@/ui/page'

interface SourceRow {
	source: string
	total: number
	approved: number
	rejected: number
	approvalRate: number | null
	averageScore: number | null
}

/**
 * Source-of-hire (V2-601).
 *
 * Volume, aprovação e nota **na mesma linha**, de propósito: o canal que traz
 * mais gente costuma não ser o que traz a melhor gente, e olhar volume sozinho
 * leva a investir exatamente no lugar errado.
 *
 * A barra é do volume; a nota fica em número. Duas barras competindo na mesma
 * linha viram enfeite — o olho não compara escalas diferentes lado a lado.
 */
export function SourcePanel({ days = 90 }: { days?: number }) {
	const { t } = useTranslation()
	const breakdown = empresa.usePostDashboardSourceBreakdown()

	const run = breakdown.mutate
	useEffect(() => {
		run({ data: { days } })
	}, [days, run])

	const payload = breakdown.data?.data as { total?: number; sources?: SourceRow[] } | undefined
	const sources = payload?.sources ?? []
	const max = Math.max(1, ...sources.map((row) => row.total))

	return (
		<Block title={t('analytics.sourceTitle')} description={t('analytics.sourceDescription')}>
			{breakdown.isPending && <div className='h-24 animate-pulse rounded-lg bg-card-alt' />}

			{!breakdown.isPending && sources.length === 0 && (
				<p className='py-6 text-center text-[12px] text-muted'>{t('analytics.sourceEmpty')}</p>
			)}

			{sources.length > 0 && (
				<ul className='flex flex-col gap-2.5'>
					{sources.map((row) => (
						<li key={row.source} className='flex items-center gap-3'>
							<span className='w-[110px] shrink-0 truncate text-[12.5px]'>
								{t(`analytics.source.${row.source}`, { defaultValue: row.source })}
							</span>

							<span className='h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-data-track'>
								<span
									className='block h-full rounded-full bg-lime'
									style={{ width: `${(row.total / max) * 100}%` }}
								/>
							</span>

							<span className='font-num w-9 shrink-0 text-right text-[12.5px]'>{row.total}</span>

							<span
								className='font-num w-12 shrink-0 text-right text-[12px] text-text-2'
								title={t('analytics.sourceApprovalHint')}
							>
								{row.approvalRate === null
									? '—'
									: `${Math.round(row.approvalRate * 100)}%`}
							</span>

							<span
								className={cn(
									'font-num w-10 shrink-0 text-right text-[12.5px]',
									(row.averageScore ?? 0) >= 7 ? 'text-lime-fg' : 'text-text-2',
								)}
								title={t('analytics.sourceScoreHint')}
							>
								{row.averageScore === null
									? '—'
									: row.averageScore.toFixed(1).replace('.', ',')}
							</span>
						</li>
					))}
				</ul>
			)}

			{sources.length > 0 && (
				<p className='mt-3 border-t border-border-soft pt-2 text-[11px] text-muted'>
					{t('analytics.sourceLegend')}
				</p>
			)}
		</Block>
	)
}
