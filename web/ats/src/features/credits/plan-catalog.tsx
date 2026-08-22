import { Check, ExternalLink, Infinity as InfinityIcon, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa, publico } from '@coploy/sdk/react'

import { RequireCapability } from '@/components/require-capability'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card } from '@/ui/page'
import { SkeletonCard } from '@/ui/skeleton'

interface Plano {
	slug: string
	name: string
	description: string
	priceId: string
	amount: number
	currency: string
	interval: 'month' | 'year' | null
	type: 'recurring' | 'one_time'
	/** Quantos créditos a compra concede — vem do backend, não de metadado do Stripe. */
	credits: number
	features: string
	popular?: boolean
}

/** Extras de crédito só fazem sentido para quem já assina — não são porta de entrada. */
const EXTRAS = ['creditsExtraPro', 'creditsExtraPremium']
/** Produto do candidato, não da empresa. */
const FORA_DO_CATALOGO = ['dreamJobs']

/**
 * O que dá para comprar.
 *
 * O ATS é gratuito e o crédito abre o resultado de um candidato — então a
 * compra não é "assinar para usar", é repor o que se gasta. Por isso os dois
 * formatos aparecem lado a lado com a diferença dita em uma linha: o pacote
 * não expira, a assinatura renova sozinha. Essa é a pergunta que a pessoa faz
 * na frente do preço, e ela não deveria ter que deduzir do rótulo "/mês".
 *
 * O `mode` do checkout sai do `type` do próprio catálogo. Fixar aqui seria
 * repetir no cliente uma verdade que é do Stripe — e foi assim que o catálogo
 * passou meses chamando pacote de mensalidade.
 */
export function PlanCatalog({
	assinante,
	planoAtual,
}: {
	assinante: boolean
	/** `free`, `pro`, `premium`… — decide quais extras a empresa pode comprar. */
	planoAtual?: string
}) {
	const { t, i18n } = useTranslation()
	// o catálogo é superfície PÚBLICA (qualquer um pode ver preço); comprar não
	const { data, isLoading } = publico.useGetCompaniesBillingPlans()
	const checkout = empresa.usePostCompaniesBillingCheckout()
	const portal = empresa.usePostCompaniesBillingPortal()
	const [indo, setIndo] = useState<string | null>(null)

	const todos = ((data?.data as { plans?: Plano[] } | undefined)?.plans ?? []) as Plano[]
	const planos = todos.filter(
		(plano) => !FORA_DO_CATALOGO.includes(plano.slug) && !EXTRAS.includes(plano.slug),
	)
	/*
	 * Extra é reposição, não porta de entrada: só aparece o do plano que a
	 * empresa tem. O preço do avulso espelha a tarifa por crédito de cada plano,
	 * então vendê-lo a quem não assina entregaria o crédito mais barato da
	 * tabela para quem não pagou nenhum dos dois.
	 *
	 * O servidor recusa de qualquer jeito (`assertCanBuy` no checkout) — isto
	 * aqui é só não oferecer o que seria negado.
	 */
	const EXTRA_DO_PLANO: Record<string, string> = {
		pro: 'creditsExtraPro',
		premium: 'creditsExtraPremium',
	}
	const extraPermitido = planoAtual ? EXTRA_DO_PLANO[planoAtual] : undefined
	const extras = todos.filter((plano) => plano.slug === extraPermitido)

	const dinheiro = (plano: Plano) =>
		new Intl.NumberFormat(i18n.language, {
			style: 'currency',
			currency: plano.currency.toUpperCase(),
		}).format(plano.amount / 100)

	/** Quanto sai cada crédito neste plano — a comparação que a pessoa faz de cabeça. */
	const precoPorCredito = (plano: Plano) =>
		new Intl.NumberFormat(i18n.language, {
			style: 'currency',
			currency: plano.currency.toUpperCase(),
		}).format(plano.amount / 100 / plano.credits)

	/** O avulso correspondente, para dizer quanto custa repor depois. */
	const extraDoPlano = (plano: Plano) =>
		todos.find((item) => item.slug === EXTRA_DO_PLANO[plano.slug])

	async function comprar(plano: Plano) {
		setIndo(plano.priceId)
		try {
			const retorno = `${window.location.origin}/creditos`
			const resposta = await checkout.mutateAsync({
				data: {
					priceId: plano.priceId,
					// o formato manda: pacote é pagamento, plano é assinatura
					mode: plano.type === 'one_time' ? 'payment' : 'subscription',
					successUrl: `${retorno}?compra=ok`,
					cancelUrl: `${retorno}?compra=cancelada`,
				},
			})
			const url = (resposta.data as { url?: string } | undefined)?.url
			if (url) window.location.href = url
			else setIndo(null)
		} catch {
			setIndo(null)
		}
	}

	async function gerenciar() {
		const resposta = await portal.mutateAsync({
			data: { returnUrl: `${window.location.origin}/creditos` },
		})
		const url = (resposta.data as { url?: string } | undefined)?.url
		if (url) window.location.href = url
	}

	if (isLoading) return <SkeletonCard lines={3} />
	if (planos.length === 0) return null

	return (
		<Card title={t('plans.title')} description={t('plans.hint')}>
			<div className='grid gap-3 md:grid-cols-2'>
				{planos.map((plano) => (
					<div
						key={plano.priceId}
						className={cn(
							'flex flex-col rounded-xl border p-4',
							plano.popular ? 'border-lime bg-lime-soft/20' : 'border-border bg-surface',
						)}
					>
						<div className='flex items-start justify-between gap-2'>
							<p className='text-[13.5px] font-medium'>{plano.name}</p>
							<span
								className={cn(
									'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]',
									plano.type === 'one_time'
										? 'bg-card-alt text-text-2'
										: 'bg-lime-soft text-lime-fg',
								)}
							>
								{plano.type === 'one_time' ? (
									<InfinityIcon size={10} />
								) : (
									<RefreshCw size={10} />
								)}
								{t(plano.type === 'one_time' ? 'plans.oneTime' : 'plans.recurring')}
							</span>
						</div>

						<p className='font-num mt-2 text-[24px] font-semibold tracking-tight'>
							{dinheiro(plano)}
							{plano.interval && (
								<span className='ml-1 text-[12.5px] font-normal text-muted'>
									{t(`plans.per.${plano.interval}`)}
								</span>
							)}
						</p>

						{/* a diferença que decide a compra, escrita — não deduzida do "/mês" */}
						<p className='mt-1 text-[12px] leading-relaxed text-text-2'>
							{t(plano.type === 'one_time' ? 'plans.oneTimeHint' : 'plans.recurringHint')}
						</p>

						{plano.description && (
							<p className='mt-2 text-[12px] leading-relaxed text-muted'>{plano.description}</p>
						)}

						{/*
						 * O que o dinheiro compra.
						 *
						 * A tela mostrava preço e mais nada: `description` e `features`
						 * vêm vazios do Stripe (metadado de produto que ninguém mantém),
						 * então a pessoa via "R$ 359,90" sem saber quantos créditos são
						 * nem quanto custa cada um. O número vem da mesma constante que
						 * o webhook usa para creditar, então tela e cobrança não têm como
						 * divergir.
						 */}
						{plano.credits > 0 && (
							<ul className='mt-3 flex flex-col gap-1.5 border-t border-border-soft pt-3'>
								<li className='flex items-start gap-1.5 text-[12px] text-text-2'>
									<Check size={12} className='mt-0.5 shrink-0 text-lime-fg' />
									<span>
										{t('plans.creditsIncluded', { count: plano.credits })}
										{plano.interval && ` ${t(`plans.per.${plano.interval}`)}`}
									</span>
								</li>
								<li className='flex items-start gap-1.5 text-[12px] text-text-2'>
									<Check size={12} className='mt-0.5 shrink-0 text-lime-fg' />
									<span>{t('plans.perCredit', { price: precoPorCredito(plano) })}</span>
								</li>
								{/* o que o crédito abre: sem isto o número não significa nada */}
								<li className='flex items-start gap-1.5 text-[12px] text-text-2'>
									<Check size={12} className='mt-0.5 shrink-0 text-lime-fg' />
									<span>{t('plans.whatCreditBuys')}</span>
								</li>
								{extraDoPlano(plano) && (
									<li className='flex items-start gap-1.5 text-[12px] text-text-2'>
										<Check size={12} className='mt-0.5 shrink-0 text-lime-fg' />
										<span>
											{t('plans.extraPrice', { price: dinheiro(extraDoPlano(plano)!) })}
										</span>
									</li>
								)}
							</ul>
						)}

						{/* linhas soltas no metadado do Stripe, quando alguém as escrever */}
						{plano.features && (
							<ul className='mt-2 flex flex-col gap-1.5'>
								{plano.features
									.split(/[\n|]/)
									.map((linha) => linha.trim())
									.filter(Boolean)
									.map((linha) => (
										<li key={linha} className='flex items-start gap-1.5 text-[12px] text-text-2'>
											<Check size={12} className='mt-0.5 shrink-0 text-lime-fg' />
											<span>{linha}</span>
										</li>
									))}
							</ul>
						)}

						<div className='mt-auto pt-4'>
							<RequireCapability capability='billing:write'>
								<Button
									variant={plano.popular ? 'primary' : 'secondary'}
									onClick={() => void comprar(plano)}
									disabled={indo !== null}
									className='w-full justify-center'
								>
									{indo === plano.priceId ? t('plans.going') : t('plans.buy')}
								</Button>
							</RequireCapability>
						</div>
					</div>
				))}
			</div>

			{extras.length > 0 && (
				<div className='mt-4 border-t border-border-soft pt-3'>
					<p className='text-[12px] text-muted'>{t('plans.extrasTitle')}</p>
					<div className='mt-2 flex flex-wrap gap-2'>
						{extras.map((extra) => (
							<RequireCapability key={extra.priceId} capability='billing:write'>
								<Button
									variant='secondary'
									size='sm'
									onClick={() => void comprar(extra)}
									disabled={indo !== null}
								>
									{extra.name} · {dinheiro(extra)}
								</Button>
							</RequireCapability>
						))}
					</div>
				</div>
			)}

			{/*
			 * Cartão, recibo e cancelamento ficam no portal do Stripe. Recriar isso
			 * aqui seria assumir responsabilidade por dado de pagamento sem nenhum
			 * ganho para quem usa.
			 */}
			{assinante && (
				<div className='mt-4 border-t border-border-soft pt-3'>
					<RequireCapability capability='billing:write'>
						<Button variant='secondary' size='sm' onClick={() => void gerenciar()}>
							<ExternalLink size={12} /> {t('plans.manage')}
						</Button>
					</RequireCapability>
				</div>
			)}
		</Card>
	)
}
