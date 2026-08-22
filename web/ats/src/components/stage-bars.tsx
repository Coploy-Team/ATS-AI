import { useTranslation } from 'react-i18next'

import { CANONICAL_STAGES, stageFill, stageLabel } from '@/features/jobs/stages'
import type { StageSlice } from '@/features/jobs/map'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'

/**
 * Distribuição de candidatos por etapa. Cor é ESTÁVEL por status (ver
 * features/jobs/stages.ts) — a mesma etapa tem a mesma cor em toda linha.
 */
export function StageBars({
	stages,
	className,
	unit = 'count',
}: {
	stages: StageSlice[]
	className?: string
	/** 'count' = pessoas por etapa · 'days' = tempo médio parado (a trilha) */
	unit?: 'count' | 'days'
}) {
	const { t } = useTranslation()
	const total = stages.reduce((acc, s) => acc + s.count, 0)

	// Sem candidatos: trilho vazio, não um traço solto — o card/linha perde o
	// ritmo vertical quando um item some (feedback do produto no modo card).
	if (total === 0) {
		return (
			<Tooltip side='top' label={unit === 'days' ? t('jobs.noTrail') : t('jobs.noCandidates')}>
				<div
					className={cn('h-[14px] w-full rounded-[4px] bg-data-track/60', className)}
					aria-label={t('jobs.noCandidates')}
				/>
			</Tooltip>
		)
	}

	return (
		<div
			className={cn('flex h-[14px] w-full items-stretch gap-px overflow-hidden rounded-[4px]', className)}
		>
			{stages.map((stage) => (
				<Tooltip
					key={stage.key}
					side='top'
					label={
						unit === 'days'
							? `${stageLabel(stage.key, t)} · ${stage.count}d`
							: `${stageLabel(stage.key, t)}: ${stage.count}`
					}
				>
					<span
						style={{ width: `${(stage.count / total) * 100}%` }}
						className={cn('block min-w-[6px] transition-[width] duration-300', stageFill(stage.key))}
					/>
				</Tooltip>
			))}
		</div>
	)
}

/**
 * Legenda visível das etapas. Sem ela, a barra só é legível parando o mouse
 * em cima de cada fatia — feedback do produto.
 */
export function StageLegend({ className }: { className?: string }) {
	const { t } = useTranslation()
	return (
		<div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
			{CANONICAL_STAGES.map((key) => (
				<span key={key} className='inline-flex items-center gap-1.5 text-[11px] text-text-2'>
					<span className={cn('h-2 w-2 rounded-[2px]', stageFill(key))} />
					{stageLabel(key, t)}
				</span>
			))}
		</div>
	)
}
