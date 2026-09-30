import { useQueryClient } from '@tanstack/react-query'
import { Check, Send, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { Button } from '@/ui/button'

/**
 * Reengajar candidatos da base (V2-603, GAP 6).
 *
 * ~44% das contratações sourced vêm da própria base. A pessoa já foi avaliada e
 * já conhece a empresa — o que faltava era o caminho de volta.
 *
 * Barra fixa no rodapé em vez de modal: a escolha de quem chamar depende de ver
 * a lista, e um modal cobriria exatamente o que a pessoa precisa consultar
 * enquanto decide.
 */
export function ReengageBar({
	userIds,
	onClear,
}: {
	userIds: string[]
	onClear: () => void
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const reengage = empresa.usePostCompaniesJobsJobIdReengage()

	// só vaga aberta: convidar para vaga fechada põe gente num processo que não existe
	const { data } = empresa.useGetCompaniesJobs({ limit: '100', status: 'active' })
	const jobs = data?.data.jobs ?? []

	const [jobId, setJobId] = useState('')
	const [message, setMessage] = useState('')
	const [result, setResult] = useState<{ sent: number; invited: number } | null>(null)
	const [error, setError] = useState(false)

	async function send() {
		if (!jobId) return
		setError(false)
		try {
			const response = await reengage.mutateAsync({
				jobId,
				data: { userIds, message: message.trim() || undefined },
			})
			setResult(response.data as unknown as { sent: number; invited: number })
			setMessage('')
			await queryClient.invalidateQueries()
		} catch {
			setError(true)
		}
	}

	if (userIds.length === 0) return null

	return (
		<div className='sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-pop)]'>
			<span className='text-[12.5px] font-medium'>
				{t('reengage.selected', { count: userIds.length })}
			</span>

			<select
				value={jobId}
				onChange={(event) => setJobId(event.target.value)}
				className='h-8 min-w-[180px] rounded-lg border border-border bg-surface px-2 text-[12.5px] text-text'
			>
				<option value=''>{t('reengage.chooseJob')}</option>
				{jobs.map((job) => (
					<option key={job.id} value={job.id}>
						{job.jobName ?? job.id}
					</option>
				))}
			</select>

			<input
				value={message}
				onChange={(event) => setMessage(event.target.value)}
				maxLength={2000}
				placeholder={t('reengage.messagePlaceholder')}
				className='h-8 min-w-[200px] flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text'
			/>

			<Button onClick={() => void send()} disabled={!jobId || reengage.isPending}>
				<Send size={13} /> {t('reengage.send')}
			</Button>

			<button
				onClick={onClear}
				aria-label={t('reengage.clear')}
				className='rounded p-1 text-muted transition-colors hover:text-text'
			>
				<X size={14} />
			</button>

			{result && (
				<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
					<Check size={13} /> {t('reengage.done', { sent: result.sent, total: result.invited })}
				</span>
			)}

			{error && <span className='text-[12px] text-danger'>{t('reengage.failed')}</span>}

			{/*
			 * Deixa explícito que ninguém entra no funil sem querer: o recrutador
			 * precisa saber que o board não vai mudar agora.
			 */}
			<span className='w-full text-[11px] text-muted'>{t('reengage.note')}</span>
		</div>
	)
}
