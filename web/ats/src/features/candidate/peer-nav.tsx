import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { toPipelineCard, type PipelineCard } from '@/features/pipeline/map'
import { cn } from '@/lib/cn'

/** Mesma chave do board — a lista já está em cache quando se vem do pipeline. */
const PEER_LIMIT = '200'

/**
 * Os outros candidatos da mesma vaga.
 *
 * Avaliar alguém sozinho numa tela é o erro clássico do ATS: o recrutador vê
 * "2,4/10" e não sabe se isso é ruim ou se a vaga inteira foi mal. Aqui a
 * concorrência fica visível e navegável — revisar candidato é uma FILA, não
 * um ir-e-voltar pro board a cada pessoa.
 *
 * Ordem por nota (melhor primeiro) porque é assim que a triagem acontece; sem
 * nota vai pro fim, já que ainda não há evidência pra comparar.
 */
export function usePeers(jobId: string, candidateId: string) {
	const { data } = empresa.useGetCompaniesJobsJobIdCandidates(
		jobId,
		{ limit: PEER_LIMIT },
		{ query: { enabled: Boolean(jobId) } },
	)

	return useMemo(() => {
		const payload = data?.data && 'candidates' in data.data ? data.data : null
		/*
		 * Comparação por nota inclui só quem TEM nota.
		 *
		 * Antes entrava todo mundo, e quem não entrevistou aparecia como "2º de 2
		 * por nota nesta vaga" — uma posição num ranking do qual ele não
		 * participa. Ordenar jogando os sem nota para o fim não resolve: o número
		 * continua afirmando algo falso.
		 */
		const peers = (payload?.candidates.map(toPipelineCard) ?? [])
			.filter((card) => card.score !== null)
			.sort((a, b) => {
				if (a.score === b.score) return a.name.localeCompare(b.name)
				return (b.score ?? 0) - (a.score ?? 0)
			})

		const index = peers.findIndex((peer) => peer.id === candidateId)
		return {
			peers,
			index,
			position: index >= 0 ? index + 1 : null,
			total: peers.length,
			previous: index > 0 ? peers[index - 1] : null,
			next: index >= 0 && index < peers.length - 1 ? peers[index + 1] : null,
		}
	}, [data, candidateId])
}

export function PeerNav({
	jobId,
	currentId,
	peers,
	position,
	total,
	previous,
	next,
	compact = false,
	hidePosition = false,
}: {
	jobId: string
	currentId: string
	peers: PipelineCard[]
	position: number | null
	total: number
	previous: PipelineCard | null
	next: PipelineCard | null
	/** Na barra fixa só cabem posição e setas; os chips ficam no header. */
	compact?: boolean
	/** Evita repetir "3º de 3" quando o header logo acima já diz o mesmo. */
	hidePosition?: boolean
}) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	// candidato único não tem fila: a barra inteira vira ruído
	if (total <= 1) return null

	const go = (peer: PipelineCard | null) => {
		if (!peer) return
		navigate({
			to: '/vagas/$jobId/candidatos/$candidateId',
			params: { jobId, candidateId: peer.id },
		})
	}

	return (
		<div
			className={cn(
				'flex flex-wrap items-center gap-x-3 gap-y-2',
				compact ? '' : 'mt-3 border-t border-border-soft pt-3',
			)}
		>
			{!hidePosition && (
				<p className='text-[12px] text-text-2'>
				{position !== null ? (
					<>
						<span className='font-num font-medium text-text'>
							{t('candidate.peerPosition', { position, total })}
						</span>{' '}
						<span className='text-muted'>{t('candidate.peerByScore')}</span>
					</>
				) : (
					t('candidate.peerTotal', { total })
				)}
				</p>
			)}

			<div className='flex items-center gap-1'>
				<PeerButton
					disabled={!previous}
					onClick={() => go(previous)}
					label={previous ? t('candidate.peerPrevious', { name: previous.name }) : ''}
				>
					<ChevronLeft size={14} />
				</PeerButton>
				<PeerButton
					disabled={!next}
					onClick={() => go(next)}
					label={next ? t('candidate.peerNext', { name: next.name }) : ''}
				>
					<ChevronRight size={14} />
				</PeerButton>
			</div>

			{/* a fila inteira, clicável: comparar é olhar o vizinho, não voltar ao board */}
			{!compact && (
				<div className='-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-0.5'>
					{peers.map((peer) => {
						const current = peer.id === currentId
						return (
							<button
								key={peer.id}
								onClick={() => go(peer)}
								title={peer.name}
								className={cn(
									'inline-flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11.5px] transition-colors',
									current
										? 'border-lime bg-lime-soft text-lime-fg'
										: 'border-border text-text-2 hover:bg-hover hover:text-text',
								)}
							>
								{peer.photoUrl ? (
									<img
										src={peer.photoUrl}
										alt=''
										width={18}
										height={18}
										className='h-[18px] w-[18px] rounded-full object-cover'
									/>
								) : (
									<span className='flex h-[18px] w-[18px] items-center justify-center rounded-full bg-card-alt text-[9px] font-semibold'>
										{peer.name.slice(0, 2).toUpperCase()}
									</span>
								)}
								<span className='max-w-[104px] truncate'>{peer.name.split(' ')[0]}</span>
								{peer.score !== null && (
									<span className='font-num text-[10.5px] text-muted'>
										{peer.score.toFixed(1).replace('.', ',')}
									</span>
								)}
							</button>
						)
					})}
				</div>
			)}
		</div>
	)
}

function PeerButton({
	disabled,
	onClick,
	label,
	children,
}: {
	disabled: boolean
	onClick: () => void
	label: string
	children: React.ReactNode
}) {
	return (
		<button
			disabled={disabled}
			onClick={onClick}
			aria-label={label}
			title={label}
			className='inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-2 transition-colors hover:bg-hover hover:text-text disabled:opacity-35 disabled:hover:bg-transparent'
		>
			{children}
		</button>
	)
}
