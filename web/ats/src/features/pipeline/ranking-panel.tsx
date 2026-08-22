import { Info, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Card } from '@/ui/page'

interface Ranked {
	jobAppliedId: string
	userId: string
	score: number
	position: number
	why: Array<{ feature: string; contribution: number; value: number }>
	modelVersion: string
}

/**
 * Ranking explicável (V2-904).
 *
 * Duas regras de produto visíveis na tela:
 *
 * 1. **A escolha de ordenar é do recrutador.** O ranking é uma sugestão ao lado
 *    da lista, não a ordem imposta ao board. Quem decide continua decidindo.
 * 2. **Toda posição vem com o porquê.** Se não dá para dizer por que subiu, não
 *    entra — e um número sozinho não diz. As três features de maior peso
 *    aparecem em texto humano.
 *
 * Em shadow (`enforcing: false`) o painel se anuncia como em observação, em vez
 * de sumir: esconder faria o recrutador achar que não existe ranking, e o ponto
 * da fase de sombra é justamente comparar com a decisão dele.
 */
export function RankingPanel({
	jobId,
	names,
	onSelect,
}: {
	jobId: string
	/** `jobAppliedId → nome`, para o painel não refazer a busca da lista. */
	names: Record<string, string>
	onSelect?: (jobAppliedId: string) => void
}) {
	const { t } = useTranslation()
	const { data, isLoading } = empresa.useGetCompaniesJobsJobIdRanking(jobId)

	const payload = data?.data as
		| { enforcing?: boolean; modelVersion?: string; candidates?: Ranked[] }
		| undefined

	const candidates = (payload?.candidates ?? []).slice(0, 10)
	if (!isLoading && candidates.length === 0) return null

	return (
		<Card
			title={t('ranking.title')}
			description={t('ranking.description')}
			actions={
				payload?.enforcing === false && (
					<span className='inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-2'>
						<Info size={11} /> {t('ranking.shadow')}
					</span>
				)
			}
		>
			{isLoading && <div className='h-24 animate-pulse rounded-lg bg-card-alt' />}

			<ol className='flex flex-col gap-1.5'>
				{candidates.map((candidate) => (
					<li key={candidate.jobAppliedId}>
						<button
							type='button'
							onClick={() => onSelect?.(candidate.jobAppliedId)}
							className={cn(
								'flex w-full items-start gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left transition-colors',
								onSelect && 'hover:bg-hover',
							)}
						>
							<span className='font-num mt-0.5 w-5 shrink-0 text-[12px] text-muted'>
								{candidate.position}
							</span>

							<span className='min-w-0 flex-1'>
								<span className='block truncate text-[12.5px] font-medium'>
									{names[candidate.jobAppliedId] ?? candidate.jobAppliedId}
								</span>
								{/* o porquê, em texto humano — é o que torna o ranking utilizável */}
								<span className='mt-0.5 block truncate text-[11.5px] text-text-2'>
									{candidate.why
										.map((item) => t(`metrics.feature.${item.feature}`, { defaultValue: item.feature }))
										.join(' · ')}
								</span>
							</span>

							<span className='font-num shrink-0 text-[12px] text-lime-fg'>
								{Math.round(candidate.score * 100)}
							</span>
						</button>
					</li>
				))}
			</ol>

			<p className='mt-3 flex items-center gap-1.5 border-t border-border-soft pt-2.5 text-[11px] text-muted'>
				<Sparkles size={11} />
				{t('ranking.footer', { version: payload?.modelVersion ?? '—' })}
			</p>
		</Card>
	)
}
