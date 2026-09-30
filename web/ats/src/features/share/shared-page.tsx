import { useNavigate, useSearch } from '@tanstack/react-router'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { normalizeStageKey, stageFill, stageLabel } from '@/features/jobs/stages'
import { cn } from '@/lib/cn'
import { refId } from '@/lib/ref'
import { normalizeScore } from '@/lib/score'
import { Page } from '@/ui/page'

/**
 * O que o link de compartilhamento abre — agora DENTRO do ATS.
 *
 * Eu tinha feito o link apontar para o visualizador da v1, e estava errado: o
 * v1 vai ser removido, então era uma tela nova nascendo dependente de um
 * produto em retirada.
 *
 * A visibilidade vem do SERVIDOR (`visibility`): se a nota não foi liberada,
 * ela nem chega no payload. Esta tela só declara o que veio, para o leitor não
 * achar que falta dado por erro.
 */
export function SharedPage() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { s: code } = useSearch({ strict: false }) as { s?: string }

	const { data, isLoading, isError } = empresa.useGetCompaniesShareLinksCodeCandidates(
		code ?? '',
		{ query: { enabled: Boolean(code) } },
	)

	/*
	 * Chegar SEM código não é link inválido — é quem entrou pela porta da frente
	 * em vez de pelo link. Dizer "inválido" mandaria a pessoa pedir um link novo
	 * quando o dela pode estar perfeito, só não foi usado.
	 */
	if (!code || isError) {
		const semCodigo = !code
		return (
			<Page title={t('shared.title')}>
				<div className='rounded-xl border border-border bg-card px-4 py-14 text-center'>
					<AlertCircle size={20} className='mx-auto mb-2 text-muted' />
					<p className='text-[13px] font-medium'>
						{t(semCodigo ? 'shared.noCodeTitle' : 'shared.invalidTitle')}
					</p>
					<p className='mx-auto mt-1 max-w-[420px] text-[12.5px] leading-relaxed text-muted'>
						{t(semCodigo ? 'shared.noCodeHint' : 'shared.invalidHint')}
					</p>
				</div>
			</Page>
		)
	}

	const job = data?.data.job
	const visibility = data?.data.visibility
	const candidatos = (data?.data.candidates ?? []) as Array<Record<string, unknown>>

	return (
		<Page
			title={job?.jobName ?? t('shared.title')}
			subtitle={isLoading ? undefined : t('shared.subtitle', { count: candidatos.length })}
		>
			{visibility && (
				<p className='mb-3 text-[12px] text-muted'>
					{t('shared.showing')}{' '}
					{[
						visibility.score && t('share.sections.score'),
						visibility.feedback && t('share.sections.feedback'),
						visibility.analysis && t('share.sections.analysis'),
					]
						.filter(Boolean)
						.join(' · ') || t('shared.nothingLiberated')}
				</p>
			)}

			<div className='overflow-hidden rounded-xl border border-border bg-card'>
				{isLoading &&
					Array.from({ length: 5 }, (_, i) => (
						<div key={i} className='border-b border-border-soft px-4 py-3.5 last:border-0'>
							<div className='h-6 animate-pulse rounded bg-card-alt' />
						</div>
					))}

				{!isLoading && candidatos.length === 0 && (
					<p className='px-4 py-14 text-center text-[12.5px] text-muted'>{t('shared.empty')}</p>
				)}

				{!isLoading &&
					candidatos.map((item) => {
						const userId = refId(item.user_ref) ?? String(item.id)
						const score = normalizeScore(item.score)
						const stage = normalizeStageKey(
							(item.candidateStatus ?? item.candidate_status ?? '') as string,
						)
						return (
							<button
								key={String(item.id)}
								type='button'
								onClick={() =>
									navigate({
										to: '/compartilhado/$userId',
										params: { userId },
										search: { s: code },
									})
								}
								className='flex w-full items-center gap-3 border-b border-border-soft px-4 py-3 text-left transition-colors last:border-0 hover:bg-hover'
							>
								<span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card-alt text-[10px] font-semibold text-text-2'>
									{String(item.name ?? '—').slice(0, 2).toUpperCase()}
								</span>
								<span className='min-w-0 flex-1'>
									<span className='block truncate text-[13px] font-medium'>
										{String(item.name ?? '—')}
									</span>
									{typeof item.occupation === 'string' && item.occupation && (
										<span className='block truncate text-[11.5px] text-muted'>
											{item.occupation}
										</span>
									)}
								</span>
								<span className='inline-flex shrink-0 items-center gap-1.5 text-[12px]'>
									<span className={cn('h-1.5 w-1.5 rounded-full', stageFill(stage))} />
									{stageLabel(stage, t)}
								</span>
								{visibility?.score && (
									<span
										className={cn(
											'font-num shrink-0 rounded-md border px-1.5 py-0.5 text-[12px]',
											score !== null && score >= 8
												? 'border-lime-mid text-lime-fg'
												: 'border-border text-text-2',
										)}
									>
										{score !== null ? score.toFixed(1).replace('.', ',') : '—'}
									</span>
								)}
								<ChevronRight size={14} className='shrink-0 text-muted' />
							</button>
						)
					})}
			</div>
		</Page>
	)
}
