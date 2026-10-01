import type { ReactNode } from 'react'

import { useEyebrow, useInsideJob } from '@/app/eyebrow'
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
	eyebrow,
	actions,
	children,
	/** `board` remove o padding e o scroll do miolo (kanban ocupa a tela toda). */
	variant = 'default',
	banner,
}: {
	title: ReactNode
	subtitle?: ReactNode
	/** Etiqueta mono acima do título. Ausente = derivada do menu; `null` = sem. */
	eyebrow?: ReactNode | null
	actions?: ReactNode
	children: ReactNode
	variant?: 'default' | 'board'
	/** Faixa de aviso/adoção logo abaixo do header, antes do conteúdo. */
	banner?: ReactNode
}) {
	/*
	 * Escala (plano E): o título é o único texto grande da tela — 28px Sora,
	 * peso 700, tracking negativo. Antes era 20px semibold com a mesma família
	 * do corpo, e nada na tela tinha PESO: cabeçalho, rótulo e célula eram o
	 * mesmo cinza no mesmo tamanho. A etiqueta mono em lime acima é o eyebrow
	 * do sistema (o mesmo do cabeçalho de tabela e do grupo do menu).
	 */
	const auto = useEyebrow()
	const insideJob = useInsideJob()
	const label = eyebrow === undefined ? (insideJob ? null : auto) : eyebrow
	return (
		<div className='flex h-full min-h-0 flex-col'>
			<header className='rise flex shrink-0 flex-wrap items-end justify-between gap-4 px-7 pb-5 pt-6'>
				<div className='min-w-0'>
					{label && (
						<div className='mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-lime-fg'>
							{label}
						</div>
					)}
					<h1 className='truncate font-display text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em]'>
						{title}
					</h1>
					{subtitle && (
						<div className='mt-1.5 text-[15px] leading-snug text-text-2'>{subtitle}</div>
					)}
				</div>
				{actions && <div className='flex flex-wrap items-center gap-2'>{actions}</div>}
			</header>

			{banner && <div className='shrink-0 px-7 pb-3'>{banner}</div>}

			<div
				className={cn(
					'min-h-0 flex-1',
					variant === 'board' ? 'flex' : 'overflow-y-auto px-7 pb-8',
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
				'rounded-xl border shadow-card',
				tone === 'accent'
					? 'border-lime-mid bg-lime-soft'
					: tone === 'warning'
						? 'border-amber bg-amber-soft'
						: 'border-border bg-card',
				className,
			)}
		>
			{(title || actions) && (
				<header className='flex flex-wrap items-start justify-between gap-3 border-b border-border-soft px-5 py-4'>
					<div className='min-w-0'>
						{title && (
							<h2 className='font-display text-[18px] font-bold leading-tight tracking-[-0.01em]'>
								{title}
							</h2>
						)}
						{description && (
							<p className='mt-1 text-[14px] leading-snug text-text-2'>{description}</p>
						)}
					</div>
					{actions && <div className='flex items-center gap-2'>{actions}</div>}
				</header>
			)}
			<div className='p-5'>{children}</div>
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
				'grid gap-4',
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
				'flex flex-wrap items-center gap-3 rounded-xl border border-border border-l-[3px] bg-card px-4 py-3 text-[13.5px] text-text',
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
