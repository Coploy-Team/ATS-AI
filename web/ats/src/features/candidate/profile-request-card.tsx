import { Check, MailPlus, MessageSquare, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCapabilities } from '@/lib/capabilities'

import { empresa } from '@coploy/sdk/react'

import { Button } from '@/ui/button'
import { Card } from '@/ui/page'

/**
 * Perfil vazio com saída.
 *
 * Trajetória em branco não é culpa do recrutador nem do candidato — ninguém
 * pediu. Antes a coluna simplesmente sumia e o buraco virava um mistério: dado
 * que não existe ou tela que é assim mesmo? Aqui o vazio é explícito e vem com
 * a ação, e o e-mail que sai oferece os DOIS caminhos (assistente e área do
 * candidato) porque as pessoas preenchem de jeitos diferentes.
 */
export function ProfileRequestCard({
	jobId,
	candidateId,
	candidateName,
}: {
	jobId: string
	candidateId: string
	candidateName: string
}) {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const [message, setMessage] = useState('')
	const [result, setResult] = useState<{ status: string; requested: string[] } | null>(null)
	const [failed, setFailed] = useState(false)
	const [open, setOpen] = useState(false)

	const request = empresa.usePostCompaniesJobsJobIdCandidatesCandidateIdRequestProfile()

	async function send() {
		setFailed(false)
		try {
			const response = await request.mutateAsync({
				jobId,
				candidateId,
				data: message.trim() ? { message: message.trim() } : {},
			})
			setResult(response.data as { status: string; requested: string[] })
		} catch {
			setFailed(true)
		}
	}

	if (result) {
		return (
			<Card title={t('candidate.profileRequest.title')}>
				{result.status === 'sent' ? (
					<p className='inline-flex items-start gap-2 text-[12.5px] text-text-2'>
						<Check size={14} className='mt-0.5 shrink-0 text-lime-fg' />
						{t('candidate.profileRequest.sent', { name: candidateName.split(' ')[0] })}
					</p>
				) : (
					// sem e-mail não é erro do sistema: é dado que a empresa não tem
					<p className='text-[12.5px] text-text-2'>{t('candidate.profileRequest.noEmail')}</p>
				)}
				{result.requested.length > 0 && (
					<p className='mt-2 text-[11.5px] text-muted'>
						{t('candidate.profileRequest.asked', { fields: result.requested.join(', ') })}
					</p>
				)}
			</Card>
		)
	}

	/*
	 * Edição open: os dois caminhos abaixo (assistente ChatGPT/Claude e a área
	 * do candidato) são canais da REDE Coploy — a instância open não os tem, e
	 * "Pedir cadastro" mandaria a pessoa pra plataforma errada (apontado pelo
	 * Henrique no teste). Aqui a trajetória chega pelo PRÓPRIO portal: import
	 * do perfil portátil (OTS) ou currículo no formulário de candidatura.
	 */
	if (!features.billing) {
		return (
			<Card title={t('candidate.profileRequest.title')}>
				<p className='text-[12.5px] leading-relaxed text-text-2'>
					{t('candidate.profileRequest.hintOpen')}
				</p>
			</Card>
		)
	}

	return (
		<Card title={t('candidate.profileRequest.title')}>
			<p className='text-[12.5px] leading-relaxed text-text-2'>
				{t('candidate.profileRequest.hint')}
			</p>

			<div className='mt-3 flex flex-col gap-2'>
				<p className='flex items-start gap-2 text-[12px] text-text-2'>
					<Sparkles size={13} className='mt-0.5 shrink-0 text-lime-fg' />
					{t('candidate.profileRequest.pathChat')}
				</p>
				<p className='flex items-start gap-2 text-[12px] text-text-2'>
					<MessageSquare size={13} className='mt-0.5 shrink-0 text-muted' />
					{t('candidate.profileRequest.pathForm')}
				</p>
			</div>

			{open && (
				<textarea
					value={message}
					onChange={(event) => setMessage(event.target.value)}
					rows={3}
					maxLength={600}
					placeholder={t('candidate.profileRequest.messagePlaceholder')}
					className='mt-3 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px] text-text'
				/>
			)}

			{failed && (
				<p className='mt-2 text-[12px] text-danger'>{t('candidate.profileRequest.failed')}</p>
			)}

			<div className='mt-3 flex flex-wrap items-center gap-2'>
				<Button onClick={() => void send()} disabled={request.isPending}>
					<MailPlus size={13} />
					{request.isPending
						? t('candidate.profileRequest.sending')
						: t('candidate.profileRequest.action')}
				</Button>
				{!open && (
					<button
						onClick={() => setOpen(true)}
						className='text-[12px] text-lime-fg hover:underline'
					>
						{t('candidate.profileRequest.addMessage')}
					</button>
				)}
			</div>
		</Card>
	)
}
