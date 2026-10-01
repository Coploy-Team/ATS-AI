import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'

import { cn } from '@/lib/cn'

/**
 * Gráficos do sistema — uma cor só (lime, a série é uma), marcas finas,
 * ponta arredondada ancorada na base, grade recessiva, hover por marca.
 * Entrada com Motion: a barra CRESCE do chão, em cascata. Sem eixos duplos,
 * sem legenda quando a série é uma (o título nomeia).
 */
export interface Ponto {
	label: string
	value: number
	/** rótulo curto do eixo (ex.: "12", "seg"); ausente = sem rótulo */
	tick?: string
}

export function ColumnChart({
	points,
	height = 140,
	formatValue = (n) => String(n),
	className,
	empty,
}: {
	points: Ponto[]
	height?: number
	formatValue?: (n: number) => string
	className?: string
	empty?: string
}) {
	const reduced = useReducedMotion()
	const [hover, setHover] = useState<number | null>(null)
	const max = Math.max(1, ...points.map((p) => p.value))
	const total = points.reduce((a, p) => a + p.value, 0)
	if (points.length === 0 || (total === 0 && empty)) {
		return <p className='py-8 text-center text-[12.5px] text-muted'>{empty}</p>
	}
	const active = hover === null ? null : points[hover]
	return (
		<div className={cn('relative', className)}>
			{/* leitura do ponto: o número vive em tinta de texto, nunca na cor da série */}
			<div className='mb-2 flex h-5 items-baseline gap-2 font-mono text-[11px] text-muted'>
				{active ? (
					<>
						<span className='font-display text-[15px] font-bold text-text'>{formatValue(active.value)}</span>
						<span>{active.label}</span>
					</>
				) : (
					<span className='text-muted'>{formatValue(total)}</span>
				)}
			</div>
			<div className='flex items-end gap-[3px]' style={{ height }} onMouseLeave={() => setHover(null)}>
				{points.map((p, i) => {
					const h = Math.max(2, (p.value / max) * (height - 16))
					return (
						<div
							key={p.label}
							onMouseEnter={() => setHover(i)}
							className='group flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-1'
						>
							<motion.span
								initial={reduced ? false : { scaleY: 0 }}
								animate={{ scaleY: 1 }}
								transition={{ duration: 0.6, delay: Math.min(i * 0.02, 0.5), ease: [0.2, 0.8, 0.2, 1] }}
								style={{ height: h, transformOrigin: 'bottom' }}
								className={cn(
									'w-full max-w-[28px] rounded-t-[4px] transition-colors',
									hover === i ? 'bg-lime' : p.value === 0 ? 'bg-data-track' : 'bg-lime/70 group-hover:bg-lime',
								)}
							/>
							<span className='h-3 truncate font-mono text-[9.5px] text-muted'>{p.tick ?? ''}</span>
						</div>
					)
				})}
			</div>
		</div>
	)
}

export function BarsH({
	rows,
	formatValue = (n) => String(n),
	className,
	empty,
}: {
	rows: Array<{ label: string; value: number; hint?: string }>
	formatValue?: (n: number) => string
	className?: string
	empty?: string
}) {
	const reduced = useReducedMotion()
	const max = Math.max(1, ...rows.map((r) => r.value))
	if (rows.length === 0) return <p className='py-8 text-center text-[12.5px] text-muted'>{empty}</p>
	return (
		<ol className={cn('flex flex-col gap-2.5', className)}>
			{rows.map((r, i) => (
				<li key={r.label} className='group flex items-center gap-3'>
					<span className='w-[38%] min-w-0 truncate text-[12.5px] text-text-2 group-hover:text-text'>{r.label}</span>
					<span className='relative h-[8px] flex-1 overflow-hidden rounded-full bg-data-track'>
						<motion.span
							initial={reduced ? false : { scaleX: 0 }}
							animate={{ scaleX: Math.max(0.01, r.value / max) }}
							transition={{ duration: 0.7, delay: Math.min(i * 0.05, 0.4), ease: [0.2, 0.8, 0.2, 1] }}
							style={{ transformOrigin: 'left' }}
							className='absolute inset-0 rounded-full bg-lime/80 group-hover:bg-lime'
						/>
					</span>
					<span className='w-12 shrink-0 text-right font-display text-[13px] font-semibold tabular-nums'>{formatValue(r.value)}</span>
					{r.hint && <span className='w-16 shrink-0 text-right font-mono text-[10.5px] text-muted'>{r.hint}</span>}
				</li>
			))}
		</ol>
	)
}

/** Agrupa datas ISO em pontos por dia, nos últimos `days` dias (hoje incluso). */
export function porDia(dates: Array<string | null | undefined>, days: number, locale: string): Ponto[] {
	const hoje = new Date()
	hoje.setHours(0, 0, 0, 0)
	const buckets = new Map<string, number>()
	const keys: Array<{ key: string; date: Date }> = []
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(hoje)
		d.setDate(hoje.getDate() - i)
		const key = d.toISOString().slice(0, 10)
		buckets.set(key, 0)
		keys.push({ key, date: d })
	}
	for (const iso of dates) {
		if (!iso) continue
		const key = new Date(iso).toISOString().slice(0, 10)
		if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
	}
	return keys.map(({ key, date }, i) => ({
		label: date.toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
		value: buckets.get(key) ?? 0,
		tick: i % Math.ceil(days / 8) === 0 ? String(date.getDate()) : undefined,
	}))
}
