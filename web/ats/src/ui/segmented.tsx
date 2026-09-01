import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'

export interface SegmentedOption {
	value: string
	label: string
}

/**
 * Filtro de UM clique para conjuntos pequenos e mutuamente exclusivos
 * (status). Dropdown esconde as opções atrás de um clique extra — quando são
 * 3 valores, mostrar tudo é mais rápido e revela o que dá pra filtrar.
 */
export function Segmented({
	options,
	value,
	onChange,
	className,
}: {
	options: SegmentedOption[]
	value: string
	onChange: (value: string) => void
	className?: string
}) {
	return (
		<div className={cn('flex rounded-full border border-border bg-surface p-0.5', className)}>
			{options.map((opt) => (
				<button
					key={opt.value}
					onClick={() => onChange(opt.value)}
					aria-pressed={value === opt.value}
					className={cn(
						'rounded-full px-2.5 py-1 text-[12px] transition-colors duration-150',
						value === opt.value
							? 'bg-lime font-medium text-lime-ink'
							: 'text-text-2 hover:bg-hover hover:text-text',
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	)
}

/**
 * Toggle só de ícone, com tooltip. Usado onde o ícone JÁ é vocabulário na
 * tela (tipo de vaga) — chip com texto deixava a barra de filtros gigante.
 */
export function IconToggle({
	active,
	onClick,
	label,
	children,
}: {
	active: boolean
	onClick: () => void
	label: string
	children: React.ReactNode
}) {
	return (
		<Tooltip side='bottom' label={label}>
			<button
				onClick={onClick}
				aria-pressed={active}
				aria-label={label}
				className={cn(
					'flex h-8 w-8 items-center justify-center rounded-full border transition-colors duration-150',
					active
						? 'border-lime-mid bg-lime-soft text-lime-fg'
						: 'border-border bg-surface text-text-2 hover:border-muted hover:text-text',
				)}
			>
				{children}
			</button>
		</Tooltip>
	)
}

/** Chip liga/desliga com texto — pra flags que não têm ícone estabelecido. */
export function ToggleChip({
	active,
	onClick,
	children,
}: {
	active: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				'h-8 rounded-full border px-3 text-[12px] transition-colors duration-150',
				active
					? 'border-lime-mid bg-lime-soft font-medium text-lime-fg'
					: 'border-border bg-surface text-text-2 hover:border-muted hover:text-text',
			)}
		>
			{children}
		</button>
	)
}
