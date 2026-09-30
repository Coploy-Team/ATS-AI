import { LayoutGrid, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'

export type ViewMode = 'table' | 'grid'

/**
 * Alternância lista/grade.
 *
 * Nasceu dentro de Vagas e virou primitiva quando Candidatos e Hunting
 * precisaram da mesma coisa. Copiar o bloco seria o terceiro lugar com a mesma
 * regra escrita à mão — e é assim que as telas param de se parecer.
 *
 * Fica sempre no fim da barra de filtros (`ml-auto`), porque é controle de
 * apresentação, não de recorte: misturado aos filtros, viraria mais um.
 */
export function ViewToggle({
	value,
	onChange,
	className,
}: {
	value: ViewMode
	onChange: (mode: ViewMode) => void
	className?: string
}) {
	const { t } = useTranslation()

	return (
		<div className={cn('ml-auto flex rounded-lg border border-border p-0.5', className)}>
			{(
				[
					['table', List, t('view.table')],
					['grid', LayoutGrid, t('view.grid')],
				] as const
			).map(([mode, Icon, label]) => (
				<Tooltip key={mode} side='bottom' label={label}>
					<button
						onClick={() => onChange(mode)}
						aria-pressed={value === mode}
						aria-label={label}
						className={cn(
							'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150',
							value === mode ? 'bg-lime text-lime-ink' : 'text-text-2 hover:bg-hover hover:text-text',
						)}
					>
						<Icon size={14} />
					</button>
				</Tooltip>
			))}
		</div>
	)
}
