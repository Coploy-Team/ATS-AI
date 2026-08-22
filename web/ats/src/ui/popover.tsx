import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'

/**
 * Menu suspenso ancorado num gatilho.
 *
 * Existe para tirar da barra de controles do player as escolhas que só
 * importam quando alguém quer mudá-las: cinco botões de velocidade e mais um
 * por idioma ocupavam metade da largura o tempo todo, e num vídeo vertical a
 * barra quebrava em três linhas.
 */
export function Popover({
	trigger,
	children,
	align = 'end',
	label,
}: {
	trigger: React.ReactNode
	children: (close: () => void) => React.ReactNode
	align?: 'start' | 'end'
	label?: string
}) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	// clicar fora e Esc fecham: menu preso na tela é pior que menu nenhum
	useEffect(() => {
		if (!open) return
		const onPointer = (event: MouseEvent) => {
			if (!ref.current?.contains(event.target as Node)) setOpen(false)
		}
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('mousedown', onPointer)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onPointer)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	return (
		<div ref={ref} className='relative'>
			<button
				type='button'
				onClick={() => setOpen((value) => !value)}
				aria-haspopup='menu'
				aria-expanded={open}
				aria-label={label}
				title={label}
				className={cn(
					'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium transition-colors',
					open
						? 'border-lime bg-lime-soft text-lime-fg'
						: 'border-border text-muted hover:text-text',
				)}
			>
				{trigger}
			</button>

			{open && (
				<div
					role='menu'
					className={cn(
						'absolute bottom-full z-30 mb-1 min-w-[124px] rounded-lg border border-border bg-card p-1 shadow-lg',
						align === 'end' ? 'right-0' : 'left-0',
					)}
				>
					{children(() => setOpen(false))}
				</div>
			)}
		</div>
	)
}

export function PopoverItem({
	active,
	onClick,
	children,
}: {
	active?: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type='button'
			role='menuitemradio'
			aria-checked={active}
			onClick={onClick}
			className={cn(
				'flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11.5px] transition-colors',
				active ? 'bg-lime-soft text-lime-fg' : 'text-text-2 hover:bg-hover hover:text-text',
			)}
		>
			{children}
		</button>
	)
}
