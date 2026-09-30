import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'

/**
 * Tempo até responder o candidato (anti-ghosting). Estourou a régua → âmbar
 * com pulso sutil: o diferencial do produto fica visível onde a decisão
 * acontece.
 */
export function SlaBadge({ label, breached = false }: { label: string; breached?: boolean }) {
	const { t } = useTranslation()
	return (
		<Tooltip side='top' label={breached ? t('jobs.slaBreached') : t('jobs.slaOk')}>
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
				{label}
			</span>
		</Tooltip>
	)
}
