import { Briefcase } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * A raiz não lista nada de propósito: o portal é POR EMPRESA (o link que ela
 * divulga carrega o companyId). Uma listagem global aqui viria a ser um
 * agregador de vagas — produto diferente, decisão diferente.
 */
export function LandingPage() {
	const { t } = useTranslation()
	return (
		<div className='flex flex-col items-center gap-3 py-24 text-center'>
			<span className='flex h-12 w-12 items-center justify-center rounded-full bg-lime-soft'>
				<Briefcase size={20} className='text-lime-fg' />
			</span>
			<h1 className='font-display text-[22px] font-semibold tracking-tight'>
				{t('landing.title')}
			</h1>
			<p className='max-w-md text-[13.5px] leading-relaxed text-text-2'>{t('landing.body')}</p>
		</div>
	)
}
