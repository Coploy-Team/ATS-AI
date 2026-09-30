import { cn } from '@/lib/cn'
import { stagger } from '@/lib/motion'
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
	/*
	 * Uma cor só conta a história (plano E): vencida em cinza, ATUAL em lime,
	 * por vir apagada, travada em âmbar. E a régua PREENCHE ao entrar —
	 * segmento a segmento, da esquerda (`.fill` com atraso por índice). É a
	 * primitiva "preencher": uma etapa avançou, a régua cresce.
	 */
	return (
		<div className={cn('flex items-center', compact ? 'gap-[3px]' : 'gap-1', className)}>
			{stages.map((stage, i) => {
				// largura proporcional ao tempo na etapa — a régua CONTA a história
				const grow = stage.days > 0 ? Math.max(stage.days / maxDays, 0.25) : 0.18
				return (
					<Tooltip
						key={stage.name}
						side='top'
						label={`${stage.name} · ${stage.days > 0 ? `${stage.days}d` : '—'}`}
					>
						<span
							style={{ flexGrow: grow, ...stagger(i, 70, 420) }}
							className={cn(
								'fill block basis-2 rounded-full transition-colors duration-150',
								compact ? 'h-[5px]' : 'h-[7px]',
								stage.state === 'done' && 'bg-data-done/45',
								stage.state === 'current' &&
									'bg-lime shadow-[0_0_10px_-2px_var(--lime)]',
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

/**
 * A régua da VAGA, como no protótipo: quatro segmentos (candidatura,
 * entrevista, selecionados, aprovados) que contam até onde o funil chegou.
 * Cada segmento enche na proporção de quem CHEGOU àquela etapa ou além;
 * segmento cheio antes do parcial fica cinza (vencido), o parcial é lime
 * (onde a vaga está), o vazio é trilho. Reprovado não entra: é saída.
 */
export function FunnelRuler({
	stages,
	className,
}: {
	stages: Array<{ key: string; count: number }>
	className?: string
}) {
	const order = ['applied', 'pending', 'selected', 'approved']
	const rank = (key: string) => (key === 'hired' ? 3 : order.indexOf(key))
	const total = stages.filter((s) => rank(s.key) >= 0).reduce((a, s) => a + s.count, 0)
	const fills = order.map((_, i) =>
		total === 0 ? 0 : stages.filter((s) => rank(s.key) >= i).reduce((a, s) => a + s.count, 0) / total,
	)
	let done = true
	return (
		<div className={cn('flex w-[120px] gap-[3px]', className)}>
			{fills.map((f, i) => {
				const isDone = f >= 1 && done
				if (f < 1) done = false
				return (
					<span
						key={order[i]}
						className='relative h-[6px] flex-1 overflow-hidden rounded-full bg-data-track'
					>
						{f > 0 && (
							<span
								style={{ ...stagger(i, 80, 320), transform: `scaleX(${f})` }}
								className={cn(
									'fill absolute inset-0 rounded-full',
									isDone ? 'bg-text-2/70' : 'bg-lime',
								)}
							/>
						)}
					</span>
				)
			})}
		</div>
	)
}
