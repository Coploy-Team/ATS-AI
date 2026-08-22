import {
	ClipboardCheck,
	HeartPulse,
	LogOut,
	MessageCircle,
	Video,
	type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui/tooltip'

/**
 * Tipo da vaga como ÍCONE. É um vocabulário fechado (4 valores) repetido em
 * toda linha — exatamente o caso em que ícone funciona: some a repetição de
 * texto e a pessoa aprende o símbolo na primeira passada (tooltip ensina).
 * Nível e segmento continuam texto porque são vocabulário aberto.
 */
const TYPE_ICON: Record<string, LucideIcon> = {
	interview: Video, // entrevista gravada com IA — o produto
	whatsapp: MessageCircle, // entrevista conversacional pelo WhatsApp
	evaluation: ClipboardCheck, // avaliação/teste
	emotional: HeartPulse, // pesquisa emocional/clima
	exitJob: LogOut, // desligamento
}

export function interviewTypeIcon(type: string | null): LucideIcon | null {
	return type ? (TYPE_ICON[type] ?? null) : null
}

/**
 * Âncora da vaga: antes mostrava iniciais do título (informação zero — "FD"
 * pra "Fiscal de Ônibus"). Agora carrega o tipo, então a coluna da esquerda
 * vira uma faixa legível de que tipo de vaga é cada linha.
 */
export function JobTypeAnchor({
	type,
	size = 'md',
	className,
}: {
	type: string | null
	size?: 'sm' | 'md'
	className?: string
}) {
	const { t } = useTranslation()
	const Icon = interviewTypeIcon(type)
	const label = type ? t(`interviewTypes.${type}`, type) : t('jobs.typeUnknown')

	// Meio-termo entre o ladrilho cinza (lia como desabilitado) e o ícone solto
	// (ficava sem acabamento): contorno fino, sem preenchimento.
	const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
	return (
		<Tooltip side='top' label={label}>
			<span
				aria-label={label}
				className={cn(
					'flex shrink-0 items-center justify-center rounded-lg border border-border text-text-2 transition-colors duration-150 group-hover:border-lime-mid group-hover:text-lime-fg',
					box,
					className,
				)}
			>
				{Icon ? (
					<Icon size={size === 'sm' ? 14 : 16} strokeWidth={1.75} />
				) : (
					<span className='text-[11px] text-muted'>—</span>
				)}
			</span>
		</Tooltip>
	)
}
