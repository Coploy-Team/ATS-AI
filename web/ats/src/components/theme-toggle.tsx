import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@/ui/tooltip'

const KEY = 'coploy.ats.theme'

export function ThemeToggle() {
	const { t } = useTranslation()
	const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

	useEffect(() => {
		document.documentElement.classList.toggle('dark', dark)
		try {
			localStorage.setItem(KEY, dark ? 'dark' : 'light')
		} catch {
			// storage indisponível (modo privado) — tema vale só pra sessão
		}
	}, [dark])

	return (
		<Tooltip side='bottom' label={dark ? t('topbar.themeLight') : t('topbar.themeDark')}>
			<button
				onClick={() => setDark((d) => !d)}
				className='flex h-8 w-8 items-center justify-center rounded-lg text-text-2 transition-colors duration-150 hover:bg-hover hover:text-text'
				aria-label={dark ? t('topbar.themeLight') : t('topbar.themeDark')}
			>
				{dark ? <Sun size={15} /> : <Moon size={15} />}
			</button>
		</Tooltip>
	)
}
