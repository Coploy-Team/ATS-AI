import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowRight, PencilLine, Sparkles } from 'lucide-react'

import { empresa } from '@coploy/sdk/react'
import { Card, Page } from '@/ui/page'
import { Button } from '@/ui/button'
import { Toggle } from '@/features/job-config/job-config-page'

type Vaga = {
	aiInterview?: boolean
	typeInterview?: string
	interviewMode?: string
	evaluateLanguage?: boolean
	jobQuestions?: unknown[]
	additionalQuestions?: unknown[]
}

/**
 * A entrevista com IA desta vaga.
 *
 * Existe só com o Motor instalado, e é o que torna o plugin uma AQUISIÇÃO
 * visível: sem ele, o ATS abre vaga, recebe candidatura e move gente no funil —
 * esta aba simplesmente não aparece.
 *
 * Antes a entrevista só podia ser configurada DURANTE a criação: para mexer nas
 * perguntas de uma vaga que já existia era preciso reabrir o formulário inteiro
 * de seis passos.
 */
export function JobInterviewPage() {
	const { t } = useTranslation()
	const { jobId } = useParams({ strict: false }) as { jobId: string }
	const [erro, setErro] = useState(false)

	const { data, refetch } = empresa.useGetCompaniesJobsSlug(jobId, {
		query: { enabled: Boolean(jobId) },
	})
	const job = data?.data as Vaga | undefined
	const patch = empresa.usePatchCompaniesJobsJobId()

	const ligada = job?.aiInterview !== false
	const perguntas =
		(job?.jobQuestions?.length ?? 0) + (job?.additionalQuestions?.length ?? 0)

	async function alternar(valor: boolean) {
		setErro(false)
		try {
			await patch.mutateAsync({ jobId, data: { aiInterview: valor } as never })
			await refetch()
		} catch {
			setErro(true)
		}
	}

	return (
		<Page title={t('jobInterview.title')} subtitle={t('jobInterview.subtitle')}>
			<div className='flex max-w-2xl flex-col gap-4'>
				<Card title={t('jobInterview.toggleTitle')}>
					<Toggle
						checked={ligada}
						onChange={(v) => void alternar(v)}
						disabled={patch.isPending}
						label={t('jobInterview.toggleLabel')}
						hint={t('jobInterview.toggleHint')}
					/>
					{erro && (
						<p className='mt-2 text-[12px] text-danger'>{t('jobConfig.saveError')}</p>
					)}
				</Card>

				{ligada && (
					<Card title={t('jobInterview.setupTitle')}>
						<dl className='flex flex-col gap-2 text-[13px]'>
							<Linha
								rotulo={t('jobForm.interviewType')}
								valor={
									job?.typeInterview ? t(`interviewTypes.${job.typeInterview}`) : undefined
								}
							/>
							<Linha
								rotulo={t('jobForm.interviewMode')}
								valor={
									job?.interviewMode
										? t(`jobForm.interviewMode.${job.interviewMode}`, {
												defaultValue: job.interviewMode,
											})
										: undefined
								}
							/>
							<Linha
								rotulo={t('jobInterview.questions')}
								valor={String(perguntas)}
							/>
						</dl>

						{/*
						 * Sem pergunta a entrevista não acontece: o candidato entra na sala
						 * e não há o que perguntar. É o mesmo motivo que impede publicar.
						 */}
						{perguntas === 0 && (
							<p className='mt-3 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-800 dark:bg-transparent dark:text-amber-400'>
								<Sparkles size={14} className='mt-px shrink-0' />
								{t('jobInterview.noQuestions')}
							</p>
						)}

						<div className='mt-3'>
							<Link to='/vagas/$jobId/editar' params={{ jobId }}>
								<Button variant='secondary'>
									<PencilLine size={13} /> {t('jobInterview.edit')}
									<ArrowRight size={12} />
								</Button>
							</Link>
						</div>
					</Card>
				)}
			</div>
		</Page>
	)
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: string }) {
	return (
		<div className='flex gap-2'>
			<dt className='w-32 shrink-0 text-muted'>{rotulo}</dt>
			<dd className='min-w-0 flex-1'>{valor?.trim() ? valor : '—'}</dd>
		</div>
	)
}
