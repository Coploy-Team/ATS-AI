import { useTranslation } from 'react-i18next'

import { formatDuration, type JobSla } from '@/features/jobs/map'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'

/**
 * SLA de resposta ao candidato (anti-ghosting). O que a célula conta:
 *  - sem régua configurada → "—"
 *  - estourado → há quanto tempo está irregular, em âmbar pulsante (é a
 *    informação acionável: quanto tempo o candidato está esperando)
 *  - dentro do prazo → a régua configurada, discreta
 */
export function SlaCell({ sla }: { sla: JobSla }) {
	const { t } = useTranslation()

	// "—" lia como dado faltando; é um ESTADO (anti-ghosting não configurado).
	if (sla.ruleHours === null) {
		return (
			<Tooltip side='top' label={t('jobs.slaOff')}>
				<span className='text-[12px] text-muted'>{t('jobs.slaNotSet')}</span>
			</Tooltip>
		)
	}

	const breached = sla.breachedForMs !== null

	return (
		<Tooltip
			side='top'
			label={
				breached
					? t('jobs.slaBreachedFor', {
							duration: formatDuration(sla.breachedForMs ?? 0),
							hours: sla.ruleHours,
						})
					: t('jobs.slaWithin', { hours: sla.ruleHours })
			}
		>
			<span
				className={cn(
					'font-num inline-flex items-center gap-1.5 text-[12px]',
					breached ? 'font-medium text-amber' : 'text-text-2',
				)}
			>
				<span
					className={cn(
						'inline-block h-1.5 w-1.5 rounded-full',
						breached ? 'animate-pulse bg-amber' : 'bg-data-track',
					)}
				/>
				{breached ? formatDuration(sla.breachedForMs ?? 0) : `${sla.ruleHours}h`}
			</span>
		</Tooltip>
	)
}
