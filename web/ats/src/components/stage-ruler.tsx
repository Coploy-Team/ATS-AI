import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'

export interface StageRulerStage {
	name: string
	/** Dias que o processo ficou/está nesta etapa. */
	days: number
	state: 'done' | 'current' | 'pending' | 'stuck'
}

/**
 * A ASSINATURA do produto (design-fundacao §3.5): a régua de etapas do
 * processo, com o estágio atual em lime e etapa travada (SLA anti-ghosting)
 * em âmbar. A mesma linguagem aparece em card do kanban, linha de tabela e
 * header do perfil — só muda a escala.
 */
export function StageRuler({
	stages,
	className,
	compact = false,
}: {
	stages: StageRulerStage[]
	className?: string
	compact?: boolean
}) {
	const maxDays = Math.max(1, ...stages.map((s) => s.days))
	return (
		<div className={cn('flex items-center', compact ? 'gap-[3px]' : 'gap-1', className)}>
			{stages.map((stage) => {
				// largura proporcional ao tempo na etapa — a régua CONTA a história
				const grow = stage.days > 0 ? Math.max(stage.days / maxDays, 0.25) : 0.18
				return (
					<Tooltip
						key={stage.name}
						side='top'
						label={`${stage.name} · ${stage.days > 0 ? `${stage.days}d` : '—'}`}
					>
						<span
							style={{ flexGrow: grow }}
							className={cn(
								'block basis-2 rounded-full transition-colors duration-150',
								compact ? 'h-[5px]' : 'h-1.5',
								stage.state === 'done' && 'bg-data-done/40',
								stage.state === 'current' && 'bg-lime shadow-[0_0_0_1px_var(--lime-ink)]/10',
								stage.state === 'stuck' && 'bg-amber',
								stage.state === 'pending' && 'bg-data-track',
							)}
						/>
					</Tooltip>
				)
			})}
		</div>
	)
}
