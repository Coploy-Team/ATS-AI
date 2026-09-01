import { Bold, Eye, Heading2, Italic, List, ListOrdered, Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import { Markdown } from './markdown'

/**
 * Editor Markdown leve para os textos da vaga.
 *
 * Deliberadamente NÃO é um WYSIWYG (TipTap etc.): o valor gravado é Markdown
 * puro — o mesmo formato que o Motor gera e que o portal renderiza — e a
 * toolbar só insere a sintaxe no cursor. Quem não conhece Markdown clica nos
 * botões e confere na prévia; quem conhece digita direto. Texto sem marcação
 * continua sendo valor válido (legado inteiro é assim).
 */
export function MarkdownEditor({
	value,
	onChange,
	rows = 8,
	placeholder,
}: {
	value: string
	onChange: (value: string) => void
	rows?: number
	placeholder?: string
}) {
	const { t } = useTranslation()
	const [preview, setPreview] = useState(false)
	const ref = useRef<HTMLTextAreaElement | null>(null)

	/** Envolve a seleção (ou insere o marcador) mantendo cursor e foco. */
	function wrap(before: string, after = before) {
		const el = ref.current
		if (!el) return
		const { selectionStart: start, selectionEnd: end } = el
		const selected = value.slice(start, end)
		const next = value.slice(0, start) + before + selected + after + value.slice(end)
		onChange(next)
		requestAnimationFrame(() => {
			el.focus()
			el.setSelectionRange(start + before.length, end + before.length)
		})
	}

	/** Prefixa cada linha da seleção (listas e títulos são por linha). */
	function prefixLines(prefix: string | ((index: number) => string)) {
		const el = ref.current
		if (!el) return
		const { selectionStart: start, selectionEnd: end } = el
		const lineStart = value.lastIndexOf('\n', start - 1) + 1
		const lineEnd = end === value.length ? end : value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end)
		const block = value.slice(lineStart, lineEnd)
		const prefixed = block
			.split('\n')
			.map((line, index) => (typeof prefix === 'string' ? prefix : prefix(index)) + line)
			.join('\n')
		const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd)
		onChange(next)
		requestAnimationFrame(() => {
			el.focus()
			el.setSelectionRange(lineStart, lineStart + prefixed.length)
		})
	}

	const tools: Array<{ icon: typeof Bold; title: string; run: () => void }> = [
		{ icon: Bold, title: t('markdown.bold'), run: () => wrap('**') },
		{ icon: Italic, title: t('markdown.italic'), run: () => wrap('*') },
		{ icon: Heading2, title: t('markdown.heading'), run: () => prefixLines('## ') },
		{ icon: List, title: t('markdown.bulletList'), run: () => prefixLines('- ') },
		{ icon: ListOrdered, title: t('markdown.numberedList'), run: () => prefixLines((i) => `${i + 1}. `) },
	]

	return (
		<div className='overflow-hidden rounded-lg border border-border'>
			<div className='flex items-center gap-0.5 border-b border-border bg-card-alt px-1.5 py-1'>
				{tools.map(({ icon: Icon, title, run }) => (
					<button
						key={title}
						type='button'
						title={title}
						disabled={preview}
						onMouseDown={(e) => {
							// mousedown, não click: click roubaria o foco do textarea
							// ANTES de lermos a seleção
							e.preventDefault()
							run()
						}}
						className='flex h-7 w-7 items-center justify-center rounded text-text-2 transition-colors hover:bg-surface hover:text-text disabled:opacity-40'
					>
						<Icon size={13} />
					</button>
				))}
				<button
					type='button'
					onClick={() => setPreview((p) => !p)}
					className={cn(
						'ml-auto flex h-7 items-center gap-1.5 rounded px-2 text-[11.5px] font-medium transition-colors',
						preview ? 'bg-surface text-text' : 'text-text-2 hover:bg-surface hover:text-text',
					)}
				>
					{preview ? <Pencil size={12} /> : <Eye size={12} />}
					{preview ? t('markdown.edit') : t('markdown.preview')}
				</button>
			</div>
			{preview ? (
				<div className='min-h-[80px] bg-surface px-3 py-2.5'>
					{value.trim() ? (
						<Markdown text={value} />
					) : (
						<p className='text-[12.5px] text-muted'>{t('markdown.previewEmpty')}</p>
					)}
				</div>
			) : (
				<textarea
					ref={ref}
					value={value}
					rows={rows}
					placeholder={placeholder}
					onChange={(e) => onChange(e.target.value)}
					className='w-full resize-y border-0 bg-surface px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-text outline-none'
				/>
			)}
		</div>
	)
}
