import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'

/**
 * Render de Markdown dos textos da vaga no portal público.
 *
 * `remark-breaks` é obrigatório: o conteúdo legado é texto puro com quebras
 * simples, que o Markdown padrão colapsaria num parágrafo único — com o
 * plugin, quebra simples vira <br> e vaga antiga renderiza como antes.
 * react-markdown não renderiza HTML embutido por padrão (seguro por design).
 */
export function Markdown({ text }: { text: string }) {
	return (
		<div className='mt-2 text-[14px] leading-relaxed text-text-2'>
			<ReactMarkdown
				remarkPlugins={[remarkBreaks]}
				components={{
					h1: ({ children }) => <h3 className='mb-1.5 mt-5 text-[14.5px] font-semibold text-text first:mt-0'>{children}</h3>,
					h2: ({ children }) => <h3 className='mb-1.5 mt-5 text-[14.5px] font-semibold text-text first:mt-0'>{children}</h3>,
					h3: ({ children }) => <h4 className='mb-1 mt-4 text-[14px] font-semibold text-text first:mt-0'>{children}</h4>,
					p: ({ children }) => <p className='mb-2.5 last:mb-0'>{children}</p>,
					ul: ({ children }) => <ul className='mb-2.5 list-disc space-y-1 pl-5 last:mb-0'>{children}</ul>,
					ol: ({ children }) => <ol className='mb-2.5 list-decimal space-y-1 pl-5 last:mb-0'>{children}</ol>,
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

/**
 * Player do vídeo institucional. Só YouTube e Vimeo viram embed — URL de
 * qualquer outro lugar NÃO vira iframe (não emoldurar origem arbitrária).
 * O parse falhou? A seção simplesmente não aparece.
 */
export function videoEmbedUrl(url: string | null): string | null {
	if (!url) return null
	try {
		const parsed = new URL(url)
		const host = parsed.hostname.replace(/^www\./, '')
		if (host === 'youtu.be') {
			const id = parsed.pathname.slice(1).split('/')[0]
			return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
		}
		if (host === 'youtube.com' || host === 'm.youtube.com') {
			const v = parsed.searchParams.get('v')
			if (v) return `https://www.youtube-nocookie.com/embed/${v}`
			const path = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)
			return path ? `https://www.youtube-nocookie.com/embed/${path[1]}` : null
		}
		if (host === 'vimeo.com') {
			const id = parsed.pathname.match(/^\/(\d+)/)
			return id ? `https://player.vimeo.com/video/${id[1]}` : null
		}
		if (host === 'player.vimeo.com') return url
		return null
	} catch {
		return null
	}
}

export function VideoEmbed({ url }: { url: string | null }) {
	const embed = videoEmbedUrl(url)
	if (!embed) return null
	return (
		<div className='mt-3 overflow-hidden rounded-xl border border-border'>
			<iframe
				src={embed}
				title='video'
				className='aspect-video w-full'
				allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
				allowFullScreen
				referrerPolicy='strict-origin-when-cross-origin'
			/>
		</div>
	)
}
