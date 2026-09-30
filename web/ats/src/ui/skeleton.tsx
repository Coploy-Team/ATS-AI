import { cn } from '@/lib/cn'

/**
 * Esqueleto de carregamento.
 *
 * Prefira ao spinner centralizado. O spinner diz "espere" e some do nada,
 * levando a tela a saltar quando o conteúdo chega; o esqueleto já mostra ONDE
 * cada coisa vai aparecer, então o layout não muda no meio do caminho e a
 * espera parece mais curta do que é.
 */
export function Skeleton({ className }: { className?: string }) {
	return <div className={cn('animate-pulse rounded-lg bg-card-alt', className)} />
}

/** Bloco de linhas de texto — o caso mais comum. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
	return (
		<div className={cn('flex flex-col gap-2', className)}>
			{Array.from({ length: lines }, (_, index) => (
				<Skeleton
					key={index}
					// a última linha mais curta: é o que faz parecer texto, não barra
					className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')}
				/>
			))}
		</div>
	)
}

/** Cartão com título e corpo, no mesmo formato dos cartões reais. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
	return (
		<div className={cn('rounded-xl border border-border bg-card p-4', className)}>
			<Skeleton className='mb-3 h-3.5 w-32' />
			<SkeletonText lines={lines} />
		</div>
	)
}
