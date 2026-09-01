import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'

import { cn } from '@/lib/cn'

/**
 * Render de Markdown dos textos da vaga (descrição, requisitos, benefícios…).
 *
 * `remark-breaks` é obrigatório aqui: TODO o conteúdo legado é texto puro com
 * quebras de linha simples, e o Markdown padrão colapsa `\n` solto no mesmo
 * parágrafo — sem o plugin, vaga antiga viraria um parágrafo único. Com ele,
 * quebra simples vira <br> (o mesmo efeito do `whitespace-pre-line` que este
 * componente substitui) e texto legado renderiza idêntico ao que era.
 *
 * react-markdown NÃO renderiza HTML embutido por padrão — o que torna seguro
 * renderizar conteúdo digitado pelo recrutador sem sanitização extra.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
	return (
		<div className={cn('text-[13px] leading-relaxed text-text-2', className)}>
			<ReactMarkdown
				remarkPlugins={[remarkBreaks]}
				components={{
					h1: ({ children }) => (
						<h3 className='mb-1.5 mt-4 text-[13.5px] font-semibold text-text first:mt-0'>{children}</h3>
					),
					h2: ({ children }) => (
						<h3 className='mb-1.5 mt-4 text-[13.5px] font-semibold text-text first:mt-0'>{children}</h3>
					),
					h3: ({ children }) => (
						<h4 className='mb-1 mt-3 text-[13px] font-semibold text-text first:mt-0'>{children}</h4>
					),
					p: ({ children }) => <p className='mb-2 last:mb-0'>{children}</p>,
					ul: ({ children }) => <ul className='mb-2 list-disc space-y-1 pl-5 last:mb-0'>{children}</ul>,
					ol: ({ children }) => <ol className='mb-2 list-decimal space-y-1 pl-5 last:mb-0'>{children}</ol>,
					li: ({ children }) => <li>{children}</li>,
					strong: ({ children }) => <strong className='font-semibold text-text'>{children}</strong>,
					a: ({ children, href }) => (
						<a href={href} target='_blank' rel='noopener noreferrer' className='underline'>
							{children}
						</a>
					),
				}}
			>
				{text}
			</ReactMarkdown>
		</div>
	)
}
