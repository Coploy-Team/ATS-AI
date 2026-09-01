import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/cn'

export interface FilterOption {
	value: string
	label: string
}

/**
 * Pill de filtro no padrão do protótipo ("Status: aberta ▾"): pill com
 * label+valor e um <select> nativo invisível por cima — dropdown do sistema,
 * acessível, zero dependência. Valor fora do default destaca em lime.
 */
export function FilterPill({
	label,
	value,
	defaultValue,
	options,
	onChange,
}: {
	label: string
	value: string
	defaultValue: string
	options: FilterOption[]
	onChange: (value: string) => void
}) {
	const current = options.find((o) => o.value === value)
	const isActive = value !== defaultValue

	return (
		<span
			className={cn(
				'relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors duration-150',
				isActive
					? 'border-lime-mid bg-lime-soft font-medium text-lime-fg'
					: 'border-border bg-surface text-text-2 hover:border-muted hover:text-text',
			)}
		>
			<span>
				{label}: <span className='font-medium'>{current?.label.toLowerCase() ?? '—'}</span>
			</span>
			<ChevronDown size={12} />
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				aria-label={label}
				className='absolute inset-0 cursor-pointer opacity-0'
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</span>
	)
}
