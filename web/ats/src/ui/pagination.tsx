import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

/** Janela de páginas ao redor da atual: 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(current: number, total: number): Array<number | '…'> {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
	const pages = new Set<number>([1, total, current])
	for (const p of [current - 1, current + 1]) {
		if (p > 1 && p < total) pages.add(p)
	}
	const sorted = [...pages].sort((a, b) => a - b)
	const out: Array<number | '…'> = []
	sorted.forEach((p, i) => {
		if (i > 0 && p - sorted[i - 1] > 1) out.push('…')
		out.push(p)
	})
	return out
}

export function Pagination({
	page,
	totalPages,
	total,
	rangeStart,
	rangeEnd,
	onChange,
	items,
}: {
	page: number
	totalPages: number
	total: number
	rangeStart: number
	rangeEnd: number
	onChange: (page: number) => void
	/**
	 * O que está sendo paginado ("vagas", "candidatos", "talentos").
	 *
	 * Estava fixo em "vagas" no texto traduzido — e como o componente é
	 * compartilhado, a tela de Candidatos dizia "1–25 de 42 vagas".
	 */
	items?: string
}) {
	const { t } = useTranslation()
	const label = items ?? t('pagination.items.records')
	if (totalPages <= 1) {
		return (
			<p className='px-1 py-3 text-[12px] text-muted'>
				{t('pagination.showingAll', { total, items: label })}
			</p>
		)
	}

	const btn =
		'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12px] transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40'

	return (
		<div className='flex flex-wrap items-center justify-between gap-3 px-1 py-3'>
			<p className='text-[12px] text-muted'>
				{t('pagination.showingRange', { from: rangeStart, to: rangeEnd, total, items: label })}
			</p>
			<div className='flex items-center gap-1'>
				<button
					className={cn(btn, 'text-text-2 hover:bg-hover hover:text-text')}
					onClick={() => onChange(page - 1)}
					disabled={page <= 1}
					aria-label={t('pagination.previous')}
				>
					<ChevronLeft size={14} />
				</button>
				{pageWindow(page, totalPages).map((p, i) =>
					p === '…' ? (
						<span key={`gap-${i}`} className='px-1 text-[12px] text-muted'>
							…
						</span>
					) : (
						<button
							key={p}
							onClick={() => onChange(p)}
							aria-current={p === page ? 'page' : undefined}
							className={cn(
								btn,
								p === page
									? 'bg-lime font-semibold text-lime-ink'
									: 'text-text-2 hover:bg-hover hover:text-text',
							)}
						>
							{p}
						</button>
					),
				)}
				<button
					className={cn(btn, 'text-text-2 hover:bg-hover hover:text-text')}
					onClick={() => onChange(page + 1)}
					disabled={page >= totalPages}
					aria-label={t('pagination.next')}
				>
					<ChevronRight size={14} />
				</button>
			</div>
		</div>
	)
}
