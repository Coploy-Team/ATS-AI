import { useTranslation } from 'react-i18next'

import { stageFill, stageLabel } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'

export interface TrailStage {
	id: string
	label: string
	days: number | null
	state: 'done' | 'current' | 'pending'
}

/**
 * Trilha do candidato no processo — a assinatura da casa na escala da tela
 * de detalhe (design-fundacao §3.5).
 *
 * O que ela conta, e nenhum ATS que pesquisamos mostra junto: quanto tempo o
 * candidato levou em cada etapa, quanto tempo está SEM RESPOSTA agora, e como
 * isso se compara com a mediana da vaga. O bloco vermelho de "sem resposta"
 * é o produto se acusando — é ele que transforma anti-ghosting de promessa em
 * número na cara do recrutador.
 */
export function ProcessTrail({
	stages,
	daysInProcess,
	medianDays,
	daysWithoutAnswer,
	atRisk,
}: {
	stages: TrailStage[]
	daysInProcess: number | null
	medianDays: number | null
	daysWithoutAnswer: number | null
	atRisk: boolean
}) {
	const { t } = useTranslation()
	const total = Math.max(
		stages.reduce((sum, stage) => sum + (stage.days ?? 0), 0) + (daysWithoutAnswer ?? 0),
		1,
	)

	return (
		<section>
			<div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
				<span className='text-[10px] uppercase tracking-wide text-muted'>
					{t('candidate.trailTitle')}
				</span>
				{daysInProcess !== null && (
					<span className='font-num text-[12.5px] font-medium'>
						{t('candidate.daysInProcess', { days: daysInProcess })}
					</span>
				)}
				{medianDays !== null && (
					<span className='font-num text-[12px] text-muted'>
						· {t('candidate.jobMedian', { days: Math.round(medianDays) })}
					</span>
				)}
				{atRisk && daysWithoutAnswer !== null && (
					<span className='font-num inline-flex items-center gap-1.5 text-[12px] font-medium text-danger'>
						<span className='h-1.5 w-1.5 animate-pulse rounded-full bg-danger' />
						{t('candidate.withoutAnswer', { days: daysWithoutAnswer })}
					</span>
				)}
			</div>

			{/* barras proporcionais ao tempo: etapa longa OCUPA mais espaço, senão
			    a régua vira enfeite e não diz onde o processo travou */}
			<div className='mt-2.5 flex items-center gap-[3px]'>
				{stages.map((stage) => (
					<span
						key={stage.id}
						style={{ flex: Math.max((stage.days ?? 0) / total, 0.06) }}
						className={cn(
							'h-2 rounded-[2px]',
							stage.state === 'done'
								? 'bg-data-track'
								: stage.state === 'current'
									? stageFill(stage.id)
									: 'bg-data-track/60',
						)}
					/>
				))}
				{atRisk && daysWithoutAnswer !== null && daysWithoutAnswer > 0 && (
					<span
						style={{ flex: Math.max(daysWithoutAnswer / total, 0.06) }}
						className='h-2 rounded-[2px] bg-danger'
					/>
				)}
			</div>

			<div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]'>
				{stages.map((stage) => (
					<span key={stage.id} className='inline-flex items-center gap-1.5'>
						<span
							className={cn(
								'h-1.5 w-1.5 rounded-full',
								stage.state === 'current' ? stageFill(stage.id) : 'bg-data-track',
							)}
						/>
						<span className={cn(stage.state === 'current' ? 'text-text' : 'text-muted')}>
							{stage.label}
						</span>
						{stage.days !== null && (
							<span className='font-num text-muted'>{stage.days}d</span>
						)}
						{stage.state === 'current' && (
							<span className='text-[10px] text-muted'>{t('candidate.currentStage')}</span>
						)}
					</span>
				))}
				{atRisk && daysWithoutAnswer !== null && (
					<span className='inline-flex items-center gap-1.5 text-danger'>
						<span className='h-1.5 w-1.5 rounded-full bg-danger' />
						{t('candidate.ghostingRisk')}
						<span className='font-num'>{daysWithoutAnswer}d</span>
					</span>
				)}
			</div>
		</section>
	)
}

/** Deriva a trilha a partir da régua da vaga e do tempo real do candidato. */
export function buildTrail(
	columns: Array<{ id: string; offTrack: boolean; label: string }>,
	currentStage: string,
	daysInProcess: number | null,
	daysInStage: number | null,
	t: (key: string) => string,
): TrailStage[] {
	const track = columns.filter((column) => !column.offTrack)
	const currentIndex = track.findIndex((column) => column.id === currentStage)
	const before = Math.max((daysInProcess ?? 0) - (daysInStage ?? 0), 0)
	// sem histórico por etapa, o tempo anterior divide igual entre as cumpridas
	const perDone = currentIndex > 0 ? Math.round(before / currentIndex) : 0

	return track.map((column, index) => ({
		id: column.id,
		label: column.label || stageLabel(column.id, t),
		days: index < currentIndex ? perDone : index === currentIndex ? daysInStage : null,
		state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending',
	}))
}
