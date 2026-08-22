import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Chassi único de página.
 *
 * Antes cada tela decidia sozinha a própria largura: umas full-width, outras
 * `max-w-[880px]` centralizadas, com paddings diferentes. O resultado era um
 * app que parecia montado por pessoas diferentes — "tem tela pela metade, tem
 * tela grande".
 *
 * A regra agora é uma só e vale pra todas: **todo conteúdo ocupa a largura
 * disponível**, e quem precisa de coluna estreita (leitura corrida) resolve
 * isso NO CONTEÚDO, não encolhendo a página. Formulário aproveita o espaço
 * distribuindo campos em grid — que é o que o dashboard antigo já fazia e
 * ficou melhor que a coluna centralizada.
 */
export function Page({
	title,
	subtitle,
	actions,
	children,
	/** `board` remove o padding e o scroll do miolo (kanban ocupa a tela toda). */
	variant = 'default',
	banner,
}: {
	title: ReactNode
	subtitle?: ReactNode
	actions?: ReactNode
	children: ReactNode
	variant?: 'default' | 'board'
	/** Faixa de aviso/adoção logo abaixo do header, antes do conteúdo. */
	banner?: ReactNode
}) {
	return (
		<div className='flex h-full min-h-0 flex-col'>
			<header className='flex shrink-0 flex-wrap items-start justify-between gap-3 px-6 pb-4 pt-5'>
				<div className='min-w-0'>
					<h1 className='truncate text-[20px] leading-tight'>{title}</h1>
					{subtitle && (
						<div className='mt-1 text-[12.5px] leading-snug text-text-2'>{subtitle}</div>
					)}
				</div>
				{actions && <div className='flex flex-wrap items-center gap-2'>{actions}</div>}
			</header>

			{banner && <div className='shrink-0 px-6 pb-3'>{banner}</div>}

			<div
				className={cn(
					'min-h-0 flex-1',
					variant === 'board' ? 'flex' : 'overflow-y-auto px-6 pb-6',
				)}
			>
				{children}
			</div>
		</div>
	)
}

/**
 * Bloco de conteúdo dentro da página. Substitui os `<section>` soltos que
 * cada tela declarava com bordas e paddings ligeiramente diferentes.
 */
export function Card({
	title,
	description,
	actions,
	children,
	className,
	tone = 'default',
}: {
	title?: ReactNode
	description?: ReactNode
	actions?: ReactNode
	children: ReactNode
	className?: string
	/** `accent` = destaque de adoção; `warning` = exige ação. */
	tone?: 'default' | 'accent' | 'warning'
}) {
	return (
		<section
			className={cn(
				'rounded-xl border',
				tone === 'accent'
					? 'border-lime-mid bg-lime-soft'
					: tone === 'warning'
						? 'border-amber bg-amber-soft'
						: 'border-border bg-card',
				className,
			)}
		>
			{(title || actions) && (
				<header className='flex flex-wrap items-start justify-between gap-3 border-b border-border-soft px-4 py-3'>
					<div className='min-w-0'>
						{title && <h2 className='font-display text-[14px] font-semibold'>{title}</h2>}
						{description && (
							<p className='mt-0.5 text-[12px] leading-snug text-text-2'>{description}</p>
						)}
					</div>
					{actions && <div className='flex items-center gap-2'>{actions}</div>}
				</header>
			)}
			<div className='p-4'>{children}</div>
		</section>
	)
}

/**
 * Grade padrão de formulário: duas colunas em telas médias, três em largas.
 * É o que permite a página ser full-width sem virar linha de 1400px.
 */
export function FormGrid({
	children,
	columns = 2,
	className,
}: {
	children: ReactNode
	columns?: 2 | 3
	className?: string
}) {
	return (
		<div
			className={cn(
				'grid gap-3',
				columns === 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2',
				className,
			)}
		>
			{children}
		</div>
	)
}

/** Faixa de aviso — uma só implementação para adoção, alerta e erro. */
export function Banner({
	tone = 'accent',
	icon,
	children,
	actions,
	onDismiss,
	className,
}: {
	tone?: 'accent' | 'warning' | 'danger'
	icon?: ReactNode
	children: ReactNode
	actions?: ReactNode
	onDismiss?: () => void
	className?: string
}) {
	return (
		/*
		 * Cartão neutro com RÉGUA de cor, não retângulo chapado.
		 *
		 * A versão anterior tintava o fundo inteiro e, no tom `danger`, também o
		 * texto. Numa tela com dois ou três avisos (Analytics tem) o resultado era
		 * uma faixa vermelha e uma verde ocupando o topo, gritando mais que os
		 * próprios números — e fora do vocabulário do ATS, que usa cartão neutro
		 * com um traço de cor. A cor fica no traço e no ícone, onde ela informa; o
		 * texto volta a ser texto.
		 */
		<div
			className={cn(
				'flex flex-wrap items-center gap-3 rounded-xl border border-border border-l-[3px] bg-card px-4 py-2.5 text-[12.5px] text-text',
				tone === 'accent'
					? 'border-l-lime'
					: tone === 'warning'
						? 'border-l-amber'
						: 'border-l-danger',
				className,
			)}
		>
			{icon && (
				<span
					className={cn(
						'shrink-0',
						tone === 'accent' ? 'text-lime-fg' : tone === 'warning' ? 'text-amber' : 'text-danger',
					)}
				>
					{icon}
				</span>
			)}
			<div className='min-w-0 flex-1 leading-snug'>{children}</div>
			{actions}
			{onDismiss && (
				<button
					onClick={onDismiss}
					aria-label='×'
					className='shrink-0 text-current opacity-60 transition-opacity hover:opacity-100'
				>
					×
				</button>
			)}
		</div>
	)
}
