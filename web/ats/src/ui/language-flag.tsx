import { cn } from '@/lib/cn'

/**
 * Bandeira do idioma.
 *
 * Nasceu na tela de Vagas e virou primitiva porque outra tela precisou da mesma
 * coisa — e duas convenções de bandeira no mesmo produto é como o candidato
 * passa a ver a mesma vaga de dois jeitos.
 *
 * Imagem, não emoji: o emoji de bandeira depende da fonte do sistema (no
 * Windows não renderiza como bandeira) e não aceita o contorno que separa a
 * bandeira do fundo da linha.
 */
const FLAG_SRC: Record<string, string> = {
	pt: 'https://flagcdn.com/w40/br.png',
	en: 'https://flagcdn.com/w40/us.png',
	es: 'https://flagcdn.com/w40/es.png',
	fr: 'https://flagcdn.com/w40/fr.png',
	it: 'https://flagcdn.com/w40/it.png',
}

/** `pt-BR`, `PT`, `pt_br` → `pt`. A vaga grava a tag completa; o mapa é por base. */
function baseLanguage(language: string): string {
	return language.trim().slice(0, 2).toLowerCase()
}

export function LanguageFlag({
	language,
	size = 'sm',
	className,
}: {
	language: string | null | undefined
	size?: 'sm' | 'md'
	className?: string
}) {
	const base = language ? baseLanguage(language) : ''
	if (!base || !FLAG_SRC[base]) return null

	return (
		<img
			src={FLAG_SRC[base]}
			alt={language ?? base}
			title={language ?? base}
			loading='lazy'
			width={size === 'md' ? 20 : 16}
			height={size === 'md' ? 20 : 16}
			className={cn(
				'block shrink-0 rounded-full object-cover ring-1 ring-border',
				size === 'md' ? 'h-5 min-h-5 w-5 min-w-5' : 'h-4 min-h-4 w-4 min-w-4',
				className,
			)}
		/>
	)
}

export { baseLanguage }
