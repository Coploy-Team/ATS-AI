import { CornerDownLeft, Loader2, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'

/**
 * Busca por talento em português.
 *
 * `GET /public_interviews` aceita 19 filtros — senioridade aferida, skill com
 * pontuação e nível de evidência, porte de empresa ideal, nota mínima. A tela
 * expunha seis. Os outros treze existiam e ninguém alcançava, porque alcançar
 * exigia conhecer o nome de cada parâmetro.
 *
 * ## O assistente traduz, não busca
 *
 * O texto vira filtro; a busca continua sendo a mesma consulta. E o que foi
 * entendido aparece como **chips editáveis**: a pessoa vê a interpretação e
 * corrige, em vez de receber uma lista mágica e ter de confiar. Busca por IA
 * que não mostra o critério é busca que ninguém consegue conferir — e a
 * primeira vez que ela erra, perde a confiança inteira.
 *
 * Pedido vago demais recebe UMA pergunta em vez de um chute.
 */
export interface Criteria {
	[key: string]: string | number
}

export function IntentBar({
	criteria,
	onApply,
	relaxed = [],
}: {
	criteria: Criteria
	onApply: (criteria: Criteria) => void
	/** Filtros que a busca soltou sozinha por não ter devolvido ninguém. */
	relaxed?: string[]
}) {
	const { t } = useTranslation()
	const interpret = empresa.usePostCompaniesHuntingIntent()
	const [text, setText] = useState('')

	const result = interpret.data?.data as
		| { criteria: Criteria; refine: string | null; summary: string }
		| undefined

	async function ask() {
		if (text.trim().length < 3) return
		const response = await interpret.mutateAsync({ data: { text: text.trim() } })
		const body = response.data as { criteria: Criteria }
		/*
		 * Aplica SEMPRE. A versão anterior segurava os filtros enquanto houvesse
		 * pergunta, e o recrutador escrevia "design, qualquer nível" para receber
		 * "que tipo de design?" com a tela vazia. Perguntar sem entregar nada não
		 * parece inteligente, parece travado.
		 */
		onApply(body.criteria)
	}

	const active = Object.entries(criteria)

	return (
		<section className='flex flex-col gap-2 rounded-xl border border-border bg-card p-3'>
			<div className='flex flex-wrap items-center gap-2'>
				<Sparkles size={14} className='shrink-0 text-lime-fg' />
				<input
					value={text}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') void ask()
					}}
					placeholder={t('hunting.intentPlaceholder')}
					className='h-9 min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-2.5 text-[13px]'
				/>
				<button
					onClick={() => void ask()}
					disabled={interpret.isPending || text.trim().length < 3}
					className='inline-flex h-9 items-center gap-1.5 rounded-lg bg-lime px-3 text-[12.5px] font-medium text-lime-ink transition-opacity disabled:opacity-50'
				>
					{interpret.isPending ? (
						<Loader2 size={13} className='animate-spin' />
					) : (
						<CornerDownLeft size={13} />
					)}
					{t('hunting.intentSearch')}
				</button>
			</div>

			{/* sugestão de refinamento — ao LADO dos resultados, nunca no lugar deles */}
			{result?.summary && <p className='text-[12px] text-muted'>{result.summary}</p>}

			{result?.refine && (
				<p className='text-[12px] text-text-2'>
					<span className='text-muted'>{t('hunting.refineHint')}</span> {result.refine}
				</p>
			)}

			{relaxed.length > 0 && (
				<p className='rounded-lg border border-border border-l-[3px] border-l-amber bg-card px-2.5 py-2 text-[12px] leading-snug text-text-2'>
					{t('hunting.relaxed', {
						filters: relaxed
							.map((key) => t(`hunting.criteria.${key}`, { defaultValue: key }))
							.join(', '),
					})}
				</p>
			)}

			{active.length > 0 && (
				<div className='flex flex-wrap items-center gap-1.5'>
					<span className='text-[11.5px] text-muted'>{t('hunting.intentApplied')}</span>
					{active.map(([key, value]) => (
						<span
							key={key}
							className={cn(
								'inline-flex items-center gap-1 rounded-full bg-lime-soft px-2 py-0.5 text-[11.5px] text-lime-fg',
							)}
						>
							{t(`hunting.criteria.${key}`, { defaultValue: key })}: {String(value)}
							<button
								onClick={() => {
									const next = { ...criteria }
									delete next[key]
									onApply(next)
								}}
								aria-label={t('filters.clear')}
								className='transition-opacity hover:opacity-70'
							>
								<X size={10} />
							</button>
						</span>
					))}
					<button
						onClick={() => onApply({})}
						className='text-[11.5px] text-muted underline-offset-2 hover:text-text hover:underline'
					>
						{t('filters.clear')}
					</button>
				</div>
			)}
		</section>
	)
}
