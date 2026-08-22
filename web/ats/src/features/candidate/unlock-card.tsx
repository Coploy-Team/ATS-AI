import { useQueryClient } from '@tanstack/react-query'
import { Lock, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { RequireCapability } from '@/components/require-capability'
import { Button } from '@/ui/button'
import { ConfirmDialog } from '@/ui/confirm-dialog'

/**
 * Desbloqueio do candidato (V2-704).
 *
 * O modelo é por **visualização**, não por entrevista executada: a empresa
 * entrevista à vontade e paga para ver quem valeu a pena. Por isso o card não
 * esconde tudo — nome, cargo, vaga e etapa continuam visíveis acima dele.
 * Ninguém compra crédito às cegas, e um muro completo faria a pessoa fechar a
 * tela em vez de desbloquear.
 *
 * Só aparece para empresa SaaS. Enterprise tem contrato mensal e nunca vê isto.
 */
export function UnlockCard({
	jobId,
	candidateId,
	jobAppliedId,
}: {
	jobId: string
	candidateId: string
	jobAppliedId: string
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const use = empresa.usePostCompaniesBillingCreditsUse()
	const { data: wallet } = empresa.useGetCompaniesBillingTalentCreditsWallet()
	// a empresa da sessão já está em cache (o topbar a busca no boot)
	const { data: companyData } = empresa.useGetCompanies()
	const companyId = companyData?.data.company?.id ?? ''

	const [error, setError] = useState(false)
	const [confirmando, setConfirmando] = useState(false)

	const balance = (wallet?.data as { balance?: number } | undefined)?.balance ?? null
	const noCredits = balance !== null && balance <= 0

	async function unlock() {
		setError(false)
		setConfirmando(false)
		try {
			await use.mutateAsync({
				data: {
					/*
					 * `candidate_interview` é o nome que o leitor do desbloqueio
					 * procura desde a v1. Esta tela nasceu gravando `view_candidate`
					 * (o motivo em `CREDITS_HISTORY_REASON`) e o resultado foi crédito
					 * debitado com candidato seguindo bloqueado.
					 */
					feature: 'candidate_interview',
					companyOwner: companyId,
					userId: candidateId,
					jobApplied: jobAppliedId,
					postJobId: jobId,
				},
			})
			// invalida tudo: o dossiê inteiro muda de forma quando destrava
			await queryClient.invalidateQueries()
		} catch {
			setError(true)
		}
	}

	return (
		<section className='rounded-xl border border-border bg-card p-5 text-center'>
			<span className='mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-lime-soft'>
				<Lock size={16} className='text-lime-fg' />
			</span>

			<h2 className='mt-3 text-[14px] font-medium'>{t('unlock.title')}</h2>
			<p className='mx-auto mt-1 max-w-[420px] text-[12.5px] text-text-2'>
				{t('unlock.description')}
			</p>

			<div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
				{/* destravar consome crédito: convidado de revisão não gasta o saldo
				    de quem o convidou — e a mensagem explica, em vez de só sumir */}
				<RequireCapability
					capability='candidate:unlock'
					fallback={<p className='text-[12.5px] text-muted'>{t('unlock.noPermission')}</p>}
				>
					{/* gastar crédito é irreversível: confirma, e dizendo o saldo que sobra */}
					<Button onClick={() => setConfirmando(true)} disabled={use.isPending || noCredits}>
						<Sparkles size={13} />
						{use.isPending ? t('unlock.unlocking') : t('unlock.action')}
					</Button>
				</RequireCapability>

				{balance !== null && (
					<span className='font-num text-[12px] text-muted'>
						{t('unlock.balance', { count: balance })}
					</span>
				)}
			</div>

			{/* sem saldo, o caminho é comprar — não adianta repetir o botão travado */}
			{noCredits && (
				<p className='mt-2 text-[12px] text-text-2'>
					{t('unlock.noCredits')}{' '}
					<a href='/creditos' className='text-lime-fg underline underline-offset-2'>
						{t('unlock.buy')}
					</a>
				</p>
			)}

			{error && <p className='mt-2 text-[12px] text-danger'>{t('unlock.failed')}</p>}

			{confirmando && (
				<ConfirmDialog
					title={t('unlock.confirmTitle')}
					description={t('unlock.confirmDescription', {
						remaining: balance !== null ? Math.max(balance - 1, 0) : '—',
					})}
					confirmLabel={t('unlock.action')}
					pending={use.isPending}
					onConfirm={() => void unlock()}
					onCancel={() => setConfirmando(false)}
				/>
			)}
		</section>
	)
}
