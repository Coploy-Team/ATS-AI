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

	/*
	 * Um checklist com nome, não um placar. "3 de 5 configurações" com duas
	 * dicas soltas não dizia QUAIS eram as cinco nem o que já estava feito —
	 * o Henrique leu e não entendeu. Cada item aparece com o seu nome, feito
	 * ou não; a dica de benefício fica só nos que faltam.
	 */
	return (
		<div
			className={cn(
				'rounded-xl border px-4 py-3',
				complete ? 'border-lime-mid bg-lime-soft' : 'border-border bg-card',
				className,
			)}
		>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='font-display text-[14px] font-semibold'>{t('adoption.checklistTitle')}</p>
				<span className='font-mono text-[11px] text-muted'>
					{done}/{items.length}
				</span>
			</div>
			<ul className='mt-3 flex flex-col gap-2'>
				{items.map((item) => (
					<li key={item.key} className='flex items-start gap-2.5'>
						<span
							className={cn(
								'mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px]',
								item.done ? 'border-lime bg-lime text-lime-ink' : 'border-border text-transparent',
							)}
						>
							<Check size={10} strokeWidth={3} />
						</span>
						<div className='min-w-0'>
							<p className={cn('text-[13px]', item.done ? 'text-text' : 'font-medium text-text')}>
								{t(`adoption.label.${item.key}`)}
							</p>
							{/* o texto diz o BENEFÍCIO, não a tarefa (§7.2) — só no que falta */}
							{!item.done && <p className='text-[12px] leading-snug text-text-2'>{t(`adoption.item.${item.key}`)}</p>}
						</div>
					</li>
				))}
			</ul>
			{complete && (
				<p className='mt-2.5 inline-flex items-center gap-1.5 text-[12px] text-lime-fg'>
					<Check size={13} /> {t('adoption.progressCompleteHint')}
				</p>
			)}
		</div>
	)
}
