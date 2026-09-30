import { useTranslation } from 'react-i18next'

import { Tooltip } from '@/ui/tooltip'

/**
 * Métricas com definição canônica (V2-602).
 *
 * As chaves espelham — o documento é normativo,
 * a tela é a superfície dele. Quando o número não bate com o do ATS anterior do
 * cliente, a conversa precisa terminar em "é assim que contamos", não em
 * planilha comparativa.
 */
export const METRICS = [
	'timeToFill',
	'timeInStage',
	'approvalRate',
	'averageScore',
	'sla',
	'source',
] as const

export type MetricKey = (typeof METRICS)[number]

/**
 * Rótulo com a definição a um hover.
 *
 * Sublinhado pontilhado em vez de ícone de "?": o ícone some no meio de um
 * cabeçalho de tabela cheio, e o pontilhado é a convenção que o leitor já
 * associa a "isto tem explicação".
 */
export function MetricLabel({
	metric,
	children,
	side = 'top',
}: {
	metric: MetricKey
	children?: React.ReactNode
	side?: 'top' | 'right' | 'bottom' | 'left'
}) {
	const { t } = useTranslation()

	return (
		<Tooltip label={t(`metrics.${metric}.definition`)} side={side}>
			<span className='cursor-help decoration-border-soft decoration-dotted underline-offset-[3px] hover:underline'>
				{children ?? t(`metrics.${metric}.label`)}
			</span>
		</Tooltip>
	)
}
