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
				<span className='rounded-md bg-card-alt px-2 py-[3px] font-mono text-[11px] text-muted'>
					{t('jobs.slaNotSet')}
				</span>
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
			{/* chip mono, como no protótipo: âmbar = vencido, lime = dentro do prazo */}
			<span
				className={cn(
					'inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] font-mono text-[11px]',
					breached ? 'bg-amber-soft text-amber' : 'bg-lime-soft text-lime-fg',
				)}
			>
				{breached && <span className='inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber' />}
				{breached ? formatDuration(sla.breachedForMs ?? 0) : `${sla.ruleHours}h`}
			</span>
		</Tooltip>
	)
}
