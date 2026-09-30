import { Link, Outlet, useParams, useRouterState } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { StatusBadge } from '@/components/status-badge'
import { statusOf } from '@/features/jobs/map'
import { useCapabilities } from '@/lib/capabilities'
import { useEyebrow } from '@/app/eyebrow'
import { cn } from '@/lib/cn'
import { LanguageFlag } from '@/ui/language-flag'

/**
 * A casa da vaga.
 *
 * A vaga é a unidade de trabalho do recrutamento e era a única entidade do
 * sistema sem página própria: clicar numa vaga levava para `/pipeline?vaga=id`,
 * uma seção do menu que pedia a vaga de novo, num seletor. O trabalho é sobre a
 * vaga; a navegação era sobre as ferramentas.
 *
 * Aqui o contexto fica no cabeçalho — nome, estado, prazo — e as ferramentas
 * viram abas. O seletor de vaga some porque não faz sentido: você já está
 * dentro de uma.
 */
const TABS = [
	'visao-geral',
	'pipeline',
	'candidatos',
	'entrevista',
	'processo',
	'time',
	'divulgacao',
] as const

/**
 * O que só existe com o plugin instalado.
 *
 * O Motor é uma aquisição: sem ele o ATS abre vaga, recebe candidatura e move
 * gente no funil. A aba de entrevista não fica cinza nem promete — ela não
 * existe.
 */
const ABAS_DO_MOTOR = new Set(['entrevista'])

/**
 * O que não existe em rascunho.
 *
 * Rascunho não tem candidato — por definição, ele nunca esteve no ar. Mostrar
 * quadro e lista vazios não é neutro: parece que a vaga está publicada e
 * ninguém se candidatou.
 */
const ABAS_SEM_CANDIDATO = new Set(['pipeline', 'candidatos'])

export function JobLayout() {
	const eyebrow = useEyebrow()
	const { t } = useTranslation()
	const { jobId } = useParams({ strict: false }) as { jobId: string }
	const { features } = useCapabilities()
	const pathname = useRouterState({ select: (state) => state.location.pathname })

	const { data, isError, isLoading } = empresa.useGetCompaniesJobsSlug(jobId, {
		query: { enabled: Boolean(jobId), retry: false },
	})
	const job = data?.data as
		| {
				jobName?: string
				status?: string
				stopped?: boolean
				public?: boolean
				language?: string | null
				feedbackSlaHours?: number | null
				slaIrregularSince?: string | null
		  }
		| undefined

	const current = TABS.find((tab) => pathname.endsWith(`/${tab}`)) ?? 'visao-geral'
	const ehRascunho = job?.status === 'draft'
	const abas = TABS.filter(
		(tab) =>
			(features.motor || !ABAS_DO_MOTOR.has(tab)) &&
			(!ehRascunho || !ABAS_SEM_CANDIDATO.has(tab)),
	)

	/*
	 * Vaga que não existe — ou que esta pessoa não alcança, que responde igual
	 * de propósito (um "existe, mas não é sua" confirmaria a vaga sigilosa).
	 *
	 * Sem isto o cabeçalho ficava em "Carregando…" para sempre e cada aba
	 * mostrava o próprio erro vermelho: três mensagens técnicas para um fato
	 * simples. A pessoa chegou aqui por um link antigo ou por um "Ver vaga" de
	 * uma lista, e precisa de uma frase, não de um erro de requisição.
	 */
	if (isError && !isLoading) {
		return (
			<div className='flex h-full min-h-0 flex-col'>
				<header className='flex shrink-0 flex-col gap-2 border-b border-border px-6 pt-5 pb-4'>
					<Link
						to='/vagas'
						className='inline-flex w-fit items-center gap-1 text-[12px] text-text-2 transition-colors hover:text-text'
					>
						<ArrowLeft size={12} /> {t('jobConfig.backToJobs')}
					</Link>
				</header>
				<div className='flex flex-1 flex-col items-center justify-center px-6 text-center'>
					<p className='font-display text-[15px] font-semibold'>{t('jobs.notFoundTitle')}</p>
					<p className='mt-1 max-w-sm text-[12.5px] leading-relaxed text-text-2'>
						{t('jobs.notFoundBody')}
					</p>
				</div>
			</div>
		)
	}

	return (
		<div className='flex h-full min-h-0 flex-col'>
			<header className='rise flex shrink-0 flex-col gap-2 border-b border-border px-7 pt-6'>
				<Link
					to='/vagas'
					className='inline-flex w-fit items-center gap-1 text-[12px] text-text-2 transition-colors hover:text-text'
				>
					<ArrowLeft size={12} /> {t('jobConfig.backToJobs')}
				</Link>

				{/* o eyebrow do sistema, com a referência da vaga em mono: é aqui que a
				    bandeira e o criador vivem agora, fora da linha da lista (E3) */}
				<div className='font-mono text-[11px] uppercase tracking-[0.16em] text-lime-fg'>
					{eyebrow}
					{jobId ? ` · #${jobId.slice(0, 8)}` : ''}
				</div>
				<div className='flex flex-wrap items-center gap-x-2.5 gap-y-1.5'>
					<h1 className='font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em]'>
						{job?.jobName ?? t('jobs.loading')}
					</h1>

					<LanguageFlag language={job?.language} />

					{/*
					 * Estado e prazo ao lado do nome: são o que decide se esta vaga
					 * precisa de você agora, e estavam espalhados entre a lista e a
					 * configuração. O selo é o mesmo componente da lista — duas fontes
					 * para "qual é o estado" divergem no primeiro estado novo.
					 */}
					{job && <StatusBadge status={statusOf(job as never)} />}

					{job?.slaIrregularSince && (
						<span className='rounded-md border border-border bg-danger-soft px-1.5 py-0.5 text-[11px] text-danger'>
							{t('jobs.slaBreached')}
						</span>
					)}

					{/*
					 * A contagem saiu do cabeçalho de propósito: "na base" (tudo que já
					 * passou) e o total do quadro (quem está em processo agora) são
					 * números diferentes, e lado a lado pareciam um erro. Cada aba
					 * mostra o seu, com o significado da aba.
					 */}
				</div>

				<nav className='flex gap-1'>
					{abas.map((tab) => (
						<Link
							key={tab}
							to={`/vagas/$jobId/${tab}`}
							params={{ jobId }}
							className={cn(
								'rounded-t-lg px-3 py-2 text-[13px] transition-colors',
								current === tab
									? 'bg-lime-soft font-medium text-lime-fg shadow-[inset_0_-2px_0_var(--lime-fg)]'
									: 'text-text-2 hover:bg-hover hover:text-text',
							)}
						>
							{t(`jobTabs.${tab}`)}
						</Link>
					))}
				</nav>
			</header>

			<div className='min-h-0 flex-1 overflow-auto'>
				<Outlet />
			</div>
		</div>
	)
}
