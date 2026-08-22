import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

export interface Option {
	value: string
	label: string
	hint?: string
}

/**
 * Select com busca.
 *
 * O `<select>` nativo só serve para listas curtas: acima de ~8 opções o
 * usuário passa a rolar procurando, e listas como categoria de vaga ou país
 * têm dezenas. Aqui digitar filtra.
 *
 * Abaixo do limiar continua fazendo sentido usar o nativo — por isso este
 * componente coexiste com o `Select` simples em vez de substituí-lo.
 */
export function SearchableSelect({
	value,
	onChange,
	options,
	placeholder,
}: {
	value: string
	onChange: (value: string) => void
	options: Option[]
	placeholder?: string
}) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const ref = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	const selected = options.find((option) => option.value === value)

	useEffect(() => {
		if (!open) {
			setQuery('')
			return
		}
		inputRef.current?.focus()
		const onPointerDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	const filtered = useMemo(() => {
		const term = query.trim().toLowerCase()
		if (!term) return options
		return options.filter(
			(option) =>
				option.label.toLowerCase().includes(term) ||
				(option.hint ?? '').toLowerCase().includes(term),
		)
	}, [options, query])

	return (
		<div ref={ref} className='relative'>
			<button
				type='button'
				onClick={() => setOpen((v) => !v)}
				className='flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-2.5 text-left text-[13px] text-text'
			>
				<span className={cn('truncate', !selected && 'text-muted')}>
					{selected?.label ?? placeholder ?? t('filters.apply')}
				</span>
				<ChevronDown size={13} className='shrink-0 text-muted' />
			</button>

			{open && (
				<div className='absolute left-0 right-0 top-10 z-40 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-pop)]'>
					<div className='flex items-center gap-2 border-b border-border-soft px-2.5 py-2'>
						<Search size={13} className='shrink-0 text-muted' />
						<input
							ref={inputRef}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={t('jobForm.searchOption')}
							className='w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-muted'
						/>
					</div>

					<div className='max-h-[260px] overflow-y-auto py-1'>
						{filtered.length === 0 && (
							<p className='px-3 py-5 text-center text-[12px] text-muted'>
								{t('jobForm.noOption')}
							</p>
						)}
						{filtered.map((option) => (
							<button
								key={option.value}
								type='button'
								onClick={() => {
									onChange(option.value)
									setOpen(false)
								}}
								className={cn(
									'flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-hover',
									option.value === value && 'bg-lime-soft',
								)}
							>
								<Check
									size={13}
									className={cn(
										'mt-0.5 shrink-0',
										option.value === value ? 'text-lime-fg' : 'text-transparent',
									)}
								/>
								<span className='min-w-0'>
									<span className='block truncate text-[12.5px]'>{option.label}</span>
									{option.hint && (
										<span className='block truncate text-[11px] text-muted'>{option.hint}</span>
									)}
								</span>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	)
}
