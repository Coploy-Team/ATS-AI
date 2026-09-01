import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

/**
 * Progresso de adoção da vaga (design-fundacao §7.2).
 *
 * "Um lugar por jornada mostra o progresso de adoção, pra migração ter
 * direção em vez de virar caça ao tesouro." Sem isto, empresa que migra
 * descobre o que falta configurar tropeçando numa tela de cada vez.
 */
export function AdoptionProgress({
	items,
	className,
}: {
	items: Array<{ key: string; done: boolean }>
	className?: string
}) {
	const { t } = useTranslation()
	const done = items.filter((item) => item.done).length
	const complete = done === items.length

	return (
		<div
			className={cn(
				'rounded-xl border px-4 py-3',
				complete ? 'border-lime-mid bg-lime-soft' : 'border-border bg-card',
				className,
			)}
		>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='text-[12.5px] font-medium'>
					{complete
						? t('adoption.progressComplete')
						: t('adoption.progress', { done, total: items.length })}
				</p>
				<div className='flex items-center gap-1'>
					{items.map((item) => (
						<span
							key={item.key}
							className={cn(
								'h-1.5 w-8 rounded-full',
								item.done ? 'bg-lime' : 'bg-data-track',
							)}
						/>
					))}
				</div>
			</div>

			{!complete && (
				<ul className='mt-2.5 flex flex-col gap-1'>
					{items
						.filter((item) => !item.done)
						.map((item) => (
							<li key={item.key} className='flex items-start gap-2 text-[12px] text-text-2'>
								<span className='mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted' />
								{/* o texto diz o BENEFÍCIO, não a tarefa (§7.2) */}
								{t(`adoption.item.${item.key}`)}
							</li>
						))}
				</ul>
			)}

			{complete && (
				<p className='mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-lime-fg'>
					<Check size={13} /> {t('adoption.progressCompleteHint')}
				</p>
			)}
		</div>
	)
}
