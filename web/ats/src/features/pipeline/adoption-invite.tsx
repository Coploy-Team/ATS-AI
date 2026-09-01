import { Link } from '@tanstack/react-router'
import { ArrowRight, Settings2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

const DISMISSED_KEY = 'coploy.ats.adoption.pipeline'

/**
 * Convite de adoção (design-fundacao §7).
 *
 * Três estados, não dois: configurado, vazio de verdade e NUNCA configurado.
 * A vaga que caiu na régua padrão está no terceiro — e mostrar as colunas
 * sem dizer nada faz o padrão do produto passar por escolha da empresa.
 *
 * Regras do §7.2 aplicadas aqui: inline e dispensável (nunca modal, nunca
 * bloqueia o board) e o texto diz o BENEFÍCIO, não a tarefa.
 */
export function AdoptionInvite({ jobId, className }: { jobId: string; className?: string }) {
	const { t } = useTranslation()
	const [dismissed, setDismissed] = useState(() => {
		try {
			return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]').includes(jobId)
		} catch {
			return false
		}
	})

	if (dismissed) return null

	function dismiss() {
		try {
			const current: string[] = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
			localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...current, jobId])]))
		} catch {
			/* dispensar é conveniência: se o storage falhar, só reaparece depois */
		}
		setDismissed(true)
	}

	return (
		<div
			className={cn(
				'flex flex-wrap items-center gap-3 rounded-xl border border-lime-mid bg-lime-soft px-3 py-2.5',
				className,
			)}
		>
			<Settings2 size={15} className='shrink-0 text-lime-fg' />
			<p className='min-w-0 flex-1 text-[12.5px] text-text'>
				<span className='font-medium'>{t('adoption.pipelineTitle')}</span>{' '}
				<span className='text-text-2'>{t('adoption.pipelineBody')}</span>
			</p>
			<Link
				to='/vagas/$jobId/configuracao'
				params={{ jobId }}
				className='inline-flex h-7 items-center gap-1.5 rounded-lg bg-lime px-3 text-[12px] font-medium text-lime-ink transition-[filter] hover:brightness-105'
			>
				{t('adoption.configure')} <ArrowRight size={12} />
			</Link>
			<button
				onClick={dismiss}
				aria-label={t('adoption.dismiss')}
				className='text-lime-fg transition-opacity hover:opacity-70'
			>
				<X size={14} />
			</button>
		</div>
	)
}
