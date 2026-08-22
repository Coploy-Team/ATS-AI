import { RefreshCw, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Navigate } from '@tanstack/react-router'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Banner, Card, Page } from '@/ui/page'

import { PlanCatalog } from './plan-catalog'

/** Valor monetário no idioma do navegador; a moeda vem do contrato. */
function formatMoney(value: number, currency: string): string {
	return new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: currency.toUpperCase(),
	}).format(value)
}

/**
 * Créditos.
 *
 * O modelo de cobrança varia por contrato (`credits` vs `contract`), então a
 * tela lê `usage` e mostra o que existir — em vez de assumir um modelo e
 * exibir zero pra quem usa o outro, que é como o box de créditos no shell
 * mostrava 0 pra todo mundo antes.
 */
/** Quantas movimentações aparecem por vez. */
const PAGE_STEP = 15

export function CreditsPage() {
	const { features } = useCapabilities()
	// créditos são o modelo comercial do SaaS — a edição open não tem billing
	if (!features.billing) return <Navigate to='/dashboard' replace />
	return <CreditsPageInner />
}

function CreditsPageInner() {
	const { t } = useTranslation()
	const [visible, setVisible] = useState(PAGE_STEP)
	const { data, isLoading, isError, refetch } = empresa.useGetCompaniesBillingUsage()
	const { data: companyData } = empresa.useGetCompanies()
	const plano = (companyData?.data as { company?: { subscriptionPlan?: string } } | undefined)
		?.company?.subscriptionPlan
	const { data: historyData } = empresa.useGetCompaniesBillingCreditsHistory()

	const usage = data?.data
	/*
	 * Um subtítulo por modelo de cobrança.
	 *
	 * O texto fixo dizia "cada entrevista com IA consome um crédito" para todo
	 * mundo — e não é verdade em nenhum dos dois: no SaaS o crédito é gasto ao
	 * ABRIR o resultado de um candidato (`view_candidate`), e no enterprise o
	 * que existe é cota de entrevistas do contrato. Contar errado o que custa
	 * dinheiro é o pior lugar possível para uma frase de sobra.
	 */
	const model = (usage as { model?: string } | undefined)?.model
	/** Plano por créditos avulsos. */
	const credits = usage?.credits as
		| { creditsTotal?: number; creditsUsed?: number; creditsRemaining?: number }
		| null
		| undefined
	/**
	 * Contrato enterprise fala outra língua: cota de entrevistas no período,
	 * com excedente cobrado por unidade. Ler só `total/used` — como eu estava
	 * fazendo — mostrava "nenhum plano ativo" pra quem tem contrato.
	 */
	const contract = usage?.contract as
		| {
				period?: string
				interviewsQuota?: number
				interviewsUsed?: number
				overageQuantity?: number
				overageRateMinor?: number
				currency?: string
		  }
		| null
		| undefined

	const history = (historyData?.data as { history?: Array<Record<string, unknown>> } | undefined)
		?.history

	const isContract = Boolean(contract)

	/*
	 * Os dois modelos contam de formas diferentes, e tratá-los igual estava
	 * mostrando ZERO para quem tem saldo.
	 *
	 * No contrato existe COTA: `interviewsQuota` e `interviewsUsed`, e o que
	 * resta é a subtração. No SaaS não existe cota nem "usados" — o
	 * `creditsTotal` já É o saldo (soma de mensais + fixos + cortesia, e ele
	 * cai quando se gasta). A tela subtraía um `creditsUsed` que a API nunca
	 * devolveu, então a conta caía num `null` que virava 0 na renderização: a
	 * barra lateral dizia 10 e a tela de créditos dizia 0, no mesmo instante.
	 */
	const total = isContract ? (contract?.interviewsQuota ?? null) : (credits?.creditsTotal ?? null)
	const used = isContract ? (contract?.interviewsUsed ?? null) : null
	const remaining = isContract
		? total !== null && used !== null
			? Math.max(total - used, 0)
			: null
		: (credits?.creditsTotal ?? null)
	const percent =
		isContract && total && total > 0 && used !== null ? Math.min((used / total) * 100, 100) : 0
	/** Abaixo disto, repor deixa de ser planejamento e vira urgência. */
	const low = remaining !== null && total !== null && total > 0 && remaining / total < 0.15

	return (
		<Page
			title={t('credits.title')}
			subtitle={t(model === 'enterprise' ? 'credits.subtitleContract' : 'credits.subtitleSaas')}
		>
			<div className='flex flex-col gap-4'>
				{/*
				 * O que o crédito compra, dito ANTES do saldo.
				 *
				 * A tela mostrava um número sem dizer para que ele serve — e no
				 * plano gratuito isso é a pergunta inteira: a pessoa não sabe se
				 * criar vaga consome, se o saldo expira, se é teste. Um número sem
				 * regra vira medo de gastar.
				 */}
				{plano === 'free' && (
					<div className='rounded-xl border border-lime/40 bg-lime-soft/30 px-4 py-3'>
						<p className='text-[13px] font-medium text-text'>{t('credits.freeTitle')}</p>
						<p className='mt-0.5 text-[12.5px] leading-relaxed text-text-2'>
							{t('credits.freeBody')}
						</p>
					</div>
				)}

				{/*
				 * O catálogo vem DEPOIS do saldo: primeiro quanto você tem, depois
				 * como repor. Invertido, a tela abre vendendo.
				 */}
				{isError && (
					<Banner
						tone='danger'
						actions={
							<Button variant='secondary' size='sm' onClick={() => refetch()}>
								<RefreshCw size={12} /> {t('jobs.retry')}
							</Button>
						}
					>
						{t('credits.error')}
					</Banner>
				)}

				{!isError && (
					/*
					 * Empilhado, não lado a lado.
					 *
					 * O grid `1fr / 320px` dava ao saldo uma coluna enorme com um
					 * número e uma barra dentro, enquanto o histórico — que é a parte
					 * comprida — ficava espremido em 320px. O resultado era metade da
					 * tela vazia com uma lista estreita rolando ao lado.
					 */
					<div className='flex flex-col gap-4'>
						<Card tone={low ? 'warning' : 'default'}>
							{isLoading ? (
								<div className='h-20 animate-pulse rounded-lg bg-card-alt' />
							) : total === null ? (
								<div className='py-6 text-center'>
									<Wallet size={20} className='mx-auto mb-2 text-muted' />
									<p className='text-[13px] font-medium'>{t('credits.noPlanTitle')}</p>
									<p className='mt-0.5 text-[12px] text-muted'>{t('credits.noPlanHint')}</p>
								</div>
							) : (
								<>
									<div className='flex flex-wrap items-end justify-between gap-3'>
										<div>
											<p className='text-[12px] text-text-2'>
												{t(isContract ? 'credits.remainingInterviews' : 'credits.remaining')}
											</p>
											<p
												className={cn(
													'font-num text-[38px] font-semibold leading-none',
													low && 'text-amber',
												)}
											>
												{remaining ?? 0}
											</p>
										</div>
										{/*
										 * "X de Y usados" e a barra pressupõem COTA. No saldo não
										 * existe teto: mostrar "0 de 10 usados" ao lado de um saldo
										 * de 10 fazia a tela parecer contraditória consigo mesma.
										 */}
										{isContract && (
											<p className='font-num text-[12.5px] text-muted'>
												{t('credits.usedOf', { used: used ?? 0, total })}
											</p>
										)}
									</div>

									{isContract && (
										<div className='mt-3 h-2.5 overflow-hidden rounded-full bg-data-track'>
											<div
												className={cn('h-2.5 rounded-full', low ? 'bg-amber' : 'bg-lime')}
												style={{ width: `${percent}%` }}
											/>
										</div>
									)}

									{low && (
										<p className='mt-2.5 text-[12px] text-amber'>{t('credits.lowWarning')}</p>
									)}

									{isContract && (
										<div className='mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-soft pt-3 text-[11.5px] text-text-2'>
											{contract?.period && (
												<span>{t('credits.contractPeriod', { period: contract.period })}</span>
											)}
											{typeof contract?.overageQuantity === 'number' &&
												contract.overageQuantity > 0 && (
													<span className='text-amber'>
														{t('credits.overage', {
															count: contract.overageQuantity,
															price: formatMoney(
																(contract.overageRateMinor ?? 0) / 100,
																contract.currency ?? 'brl',
															),
														})}
													</span>
												)}
										</div>
									)}
								</>
							)}
						</Card>

						<PlanCatalog
							assinante={model === 'saas' && !isContract && plano !== 'free'}
							planoAtual={plano}
						/>

						<Card
							title={t('credits.history')}
							description={t('credits.historyHint')}
							className='min-w-0'
						>
							{Array.isArray(history) && history.length > 0 ? (
								<>
									<ul className='-my-1 divide-y divide-border-soft'>
										{history.slice(0, visible).map((item, index) => (
											<li
												key={String(item.id ?? index)}
												className='grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.4fr)_auto] items-center gap-3 py-2 text-[12.5px]'
											>
												{/* a rota entrega `formattedFeature`/`formattedDate` prontos */}
												<span className='truncate'>
													{String(item.formattedFeature ?? item.feature ?? t('credits.movement'))}
												</span>
												<span className='truncate text-text-2'>
													{item.candidateName || item.jobName ? (
														<>
															{item.candidateName ? String(item.candidateName) : ''}
															{item.candidateName && item.jobName ? ' · ' : ''}
															{item.jobName ? String(item.jobName) : ''}
														</>
													) : (
														<span className='text-muted'>—</span>
													)}
												</span>
												<span className='font-num truncate text-[11.5px] text-muted'>
													{String(item.formattedDate ?? '')}
												</span>
												<span className='font-num text-right text-text-2'>−1</span>
											</li>
										))}
									</ul>

									{/* a lista inteira esticava a página; o resto entra sob demanda */}
									{history.length > visible && (
										<Button
											variant='secondary'
											size='sm'
											className='mt-3'
											onClick={() => setVisible((current) => current + PAGE_STEP)}
										>
											{t('credits.showMore', { count: history.length - visible })}
										</Button>
									)}
								</>
							) : (
								<p className='py-4 text-center text-[12px] text-muted'>{t('credits.noHistory')}</p>
							)}
						</Card>
					</div>
				)}
			</div>
		</Page>
	)
}
