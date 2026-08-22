import { Plug } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Estado vazio honesto das superfícies de entrevista quando o Motor não está
 * instalado (ADR-007, decisão 3).
 *
 * Na distribuição open o Motor é plugin: sem ele, tela de resultado, link de
 * entrevista e análise por IA não existem — e a regra é NUNCA botão morto,
 * NUNCA erro. Este aviso diz o que a tela faria e como ligar, em vez de fingir
 * que carrega algo que não vem.
 */
export function MotorNotice({ context }: { context: 'share' | 'interview' }) {
	const { t } = useTranslation()

	return (
		<div className='flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center'>
			<span className='flex h-10 w-10 items-center justify-center rounded-full bg-lime-soft'>
				<Plug size={18} className='text-lime-fg' />
			</span>
			<p className='text-[13.5px] font-medium'>{t('motorPlugin.title')}</p>
			<p className='max-w-md text-[12.5px] leading-relaxed text-text-2'>
				{t(`motorPlugin.${context}`)}
			</p>
			<a
				href='https://coploy.io'
				target='_blank'
				rel='noreferrer'
				className='mt-1 text-[12.5px] font-medium text-lime-fg hover:underline'
			>
				{t('motorPlugin.cta')}
			</a>
		</div>
	)
}
