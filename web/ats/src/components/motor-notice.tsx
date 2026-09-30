import { Plug } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Estado vazio honesto das superfícies de entrevista quando o Motor não está
 * instalado .
 *
 * Na distribuição open o Motor é plugin: sem ele, tela de resultado, link de
 * entrevista e análise por IA não existem — e a regra é NUNCA botão morto,
 * NUNCA erro. Este aviso diz o que a tela faria e como ligar, em vez de fingir
 * que carrega algo que não vem.
 */
export function MotorNotice({
	context,
	compact = context === 'interview',
}: {
	context: 'share' | 'interview'
	/** Uma linha discreta em vez de cartão: na coluna do candidato, o aviso não é o assunto. */
	compact?: boolean
}) {
	const { t } = useTranslation()

	if (compact) {
		return (
			<p className='flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border-soft bg-card-alt px-3 py-2 text-[12px] leading-snug text-muted'>
				<Plug size={12} className='shrink-0 text-lime-fg' />
				<span className='min-w-0 flex-1'>{t(`motorPlugin.${context}Short`)}</span>
				<a href='https://coploy.io' target='_blank' rel='noreferrer' className='shrink-0 font-medium text-lime-fg hover:underline'>
					{t('motorPlugin.cta')}
				</a>
			</p>
		)
	}

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
