import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Campo com rótulo FIXO acima, nunca placeholder-como-rótulo: o placeholder
 * some ao digitar e aí o campo preenchido não diz mais o que é (lição da aba
 * Trajetória do `web/candidate`).
 */
export function Field({
	label,
	hint,
	children,
	className,
	faltando,
}: {
	label: string
	hint?: string
	children: ReactNode
	className?: string
	/**
	 * Marca o campo que impede o avanço.
	 *
	 * A mensagem ficava só no rodapé do formulário, em cinza, longe de tudo — o
	 * Henrique disse que não dava nem para ver. Erro tem que estar ONDE ele
	 * acontece: o rótulo muda de cor, a borda também, e o campo ganha
	 * `aria-invalid` para quem usa leitor de tela ouvir a mesma coisa.
	 */
	faltando?: boolean
}) {
	return (
		<label className={cn('flex flex-col gap-1', className)} aria-invalid={faltando || undefined}>
			<span
				className={cn(
					'text-[12px] font-medium',
					faltando ? 'text-danger' : 'text-text-2',
				)}
			>
				{label}
				{hint && <span className='ml-1.5 font-normal text-muted'>{hint}</span>}
				{faltando && <span className='ml-1.5 font-normal'>· obrigatório</span>}
			</span>
			<span
				className={cn(
					'contents',
					faltando &&
						'[&_input]:border-danger [&_select]:border-danger [&_textarea]:border-danger',
				)}
			>
				{children}
			</span>
		</label>
	)
}

export function Select({
	value,
	onChange,
	options,
}: {
	value: string
	onChange: (value: string) => void
	options: Array<{ value: string; label: string }>
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
		>
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	)
}

export function TextArea({
	value,
	onChange,
	rows = 4,
	placeholder,
}: {
	value: string
	onChange: (value: string) => void
	rows?: number
	placeholder?: string
}) {
	return (
		<textarea
			value={value}
			rows={rows}
			placeholder={placeholder}
			onChange={(e) => onChange(e.target.value)}
			className='w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-text'
		/>
	)
}
