import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

export function LanguageSwitcher() {
	const { i18n } = useTranslation()
	const current = i18n.resolvedLanguage ?? 'pt'

	return (
		<div className='flex rounded-lg border border-border p-0.5'>
			{(['pt', 'en'] as const).map((lang) => (
				<button
					key={lang}
					onClick={() => void i18n.changeLanguage(lang)}
					className={cn(
						'rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors duration-150',
						current === lang ? 'bg-lime text-lime-ink' : 'text-muted hover:text-text',
					)}
				>
					{lang}
				</button>
			))}
		</div>
	)
}
