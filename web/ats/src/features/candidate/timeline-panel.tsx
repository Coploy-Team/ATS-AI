import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft, MessageSquare, Send, Sparkles, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { usePipelineStages } from '@/features/pipeline/use-pipeline-stages'

import { Button } from '@/ui/button'

interface Entry {
	id: string
	type: string
	authorName?: string | null
	body?: string | null
	metadata?: Record<string, unknown> | null
	createdAt: string
}

const ICONS: Record<string, typeof MessageSquare> = {
	comment: MessageSquare,
	stage_changed: ArrowRightLeft,
	interview_finished: Sparkles,
	scorecard_added: UserCheck,
	email_sent: Send,
	profile_requested: Send,
}

/**
 * Linha do tempo do candidato (V2-303).
 *
 * Evento de sistema e comentário humano na MESMA lista, em ordem cronológica:
 * "reprovado" sem o comentário de quem reprovou é metade da história, e o
 * comentário sem o evento perde a âncora no tempo.
 *
 * ⚠️ Registro interno. Nada daqui aparece para o candidato.
 */
export function TimelinePanel({ jobId, candidateId }: { jobId: string; candidateId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const [draft, setDraft] = useState('')

	const { data } = empresa.useGetCompaniesJobsJobIdCandidatesCandidateIdTimeline(jobId, candidateId)
	// o catálogo da vaga traduz id de etapa em rótulo, respeitando renomeações
	const { stages } = usePipelineStages(jobId, t)
	const comment = empresa.usePostCompaniesJobsJobIdCandidatesCandidateIdTimelineComments()

	const entries = ((data?.data as { entries?: Entry[] } | undefined)?.entries ?? [])
		.slice()
		.reverse()

	async function send() {
		const body = draft.trim()
		if (!body) return
		await comment.mutateAsync({ jobId, candidateId, data: { body } })
		setDraft('')
		await queryClient.invalidateQueries()
	}

	return (
		<section className='rounded-xl border border-border bg-card'>
			<header className='flex items-center gap-2 border-b border-border-soft px-4 py-2.5'>
				<MessageSquare size={14} className='shrink-0 text-text-2' />
				<h2 className='flex-1 text-[13px] font-medium'>{t('timeline.title')}</h2>
				<span className='text-[11px] text-muted'>{t('timeline.internal')}</span>
			</header>

			<div className='flex gap-2 border-b border-border-soft p-3'>
				<input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault()
							void send()
						}
					}}
					maxLength={2000}
					placeholder={t('timeline.placeholder')}
					className='h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text'
				/>
				<Button onClick={() => void send()} disabled={comment.isPending || !draft.trim()}>
					<Send size={13} />
				</Button>
			</div>

			{entries.length === 0 ? (
				<p className='px-4 py-6 text-center text-[12px] text-muted'>{t('timeline.empty')}</p>
			) : (
				<ol className='flex flex-col'>
					{entries.map((entry) => {
						const Icon = ICONS[entry.type] ?? MessageSquare
						const to = entry.metadata?.to as string | undefined
						/*
						 * O evento guarda o ID da etapa (`approved`); a linha mostrava ele
						 * cru — "Movido para approved" —, um termo que não existe em
						 * lugar nenhum da interface, ainda por cima em inglês. O catálogo
						 * de etapas da vaga é quem sabe o rótulo, inclusive quando a
						 * empresa renomeou a coluna.
						 */
						const rotuloDaEtapa = stages.find((etapa) => etapa.id === to)?.label ?? to
						return (
							<li
								key={entry.id}
								className='flex gap-2.5 border-b border-border-soft px-4 py-2.5 last:border-0'
							>
								<Icon size={13} className='mt-0.5 shrink-0 text-muted' />
								<div className='min-w-0 flex-1'>
									<p className='text-[12.5px] leading-snug'>
										{entry.type === 'comment'
											? entry.body
											: t(`timeline.event.${entry.type}`, {
													stage: rotuloDaEtapa ?? '',
													defaultValue: entry.body ?? entry.type,
												})}
									</p>
									<p className='mt-0.5 text-[11px] text-muted'>
										{[entry.authorName, new Date(entry.createdAt).toLocaleString()]
											.filter(Boolean)
											.join(' · ')}
									</p>
								</div>
							</li>
						)
					})}
				</ol>
			)}
		</section>
	)
}
