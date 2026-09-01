import { Link } from '@tanstack/react-router'
import { Coins, Plug, Send, Sparkles, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'


import { useCapabilities } from '@/lib/capabilities'

/**
 * Primeiro acesso.
 *
 * Uma conta nova cai num painel de zeros: nenhuma vaga, nenhum candidato,
 * nenhuma nota. Os números estão certos e não dizem nada — e o plano grátis,
 * que é a promessa que trouxe a pessoa até aqui, não aparecia em lugar nenhum
 * depois do login. Feedback do primeiro cadastro real: "não temos nada aqui
 * falando sobre".
 *
 * Então esta tela responde três perguntas na ordem em que elas surgem: onde eu
 * estou, o que é grátis, e qual é o próximo passo.
 *
 * Some sozinha na primeira vaga criada — onboarding que fica depois de cumprido
 * vira mobília.
 */
export function FirstRun() {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const saldo = 0

	/*
	 * A promessa muda com a edição . No SaaS a régua é o crédito e o
	 * passo 2 é divulgar o link de entrevista. Na distribuição open não há
	 * crédito nenhum, e sem o plugin do Motor não há link de entrevista — os
	 * passos honestos são trazer candidatos e, se quiser IA, plugar o Motor.
	 */
	const saas = features.billing
	const passos: ReadonlyArray<{
		icon: typeof Sparkles
		chave: string
		aberto: boolean
	}> = saas
		? [
				{ icon: Sparkles, chave: 'job', aberto: false },
				{ icon: Send, chave: 'share', aberto: false },
				{ icon: Coins, chave: 'open', aberto: false },
			]
		: features.motor
			? [
					// plugin instalado: divulgar já funciona e crédito não existe
					{ icon: Sparkles, chave: 'job', aberto: true },
					{ icon: Send, chave: 'share', aberto: false },
				]
			: [
					{ icon: Sparkles, chave: 'job', aberto: true },
					{ icon: Users, chave: 'candidates', aberto: true },
					{ icon: Plug, chave: 'motor', aberto: true },
				]

	return (
		<div className='flex flex-col gap-4'>
			<section className='rounded-xl border border-border bg-card p-6'>
				<span className='inline-flex items-center gap-1.5 rounded-full bg-lime-soft px-2.5 py-1 text-[11.5px] font-medium text-lime-fg'>
					{t(saas ? 'firstRun.planBadge' : 'firstRun.open.badge')}
				</span>

				{saas && (
					<h2 className='font-display mt-3 text-[20px] font-semibold tracking-tight'>
						{t('firstRun.title')}
					</h2>
				)}
				{/*
				 * A regra do dinheiro em UMA frase, no primeiro contato. Descobrir
				 * depois, ao esbarrar no bloqueio, é o que faz o gratuito parecer
				 * isca. Na edição open não há dinheiro nenhum — a frase vira a
				 * promessa da distribuição: os dados são seus.
				 */}
				<p className='mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-text-2'>
					{t(saas ? 'firstRun.pitch' : 'firstRun.open.pitch')}
				</p>

				<ol className='mt-5 grid gap-3 sm:grid-cols-3'>
					{passos.map((passo, indice) => (
						<li
							key={passo.chave}
							className='rounded-lg border border-border bg-surface p-3.5'
						>
							<div className='flex items-center gap-2'>
								<passo.icon size={14} className='text-lime-fg' />
								<span className='font-num text-[11px] text-muted'>
									{String(indice + 1).padStart(2, '0')}
								</span>
							</div>
							<p className='mt-2 text-[13px] font-medium'>
								{t(`firstRun.${passo.aberto ? 'open.steps' : 'steps'}.${passo.chave}.title`)}
							</p>
							<p className='mt-0.5 text-[12px] leading-relaxed text-text-2'>
								{t(`firstRun.${passo.aberto ? 'open.steps' : 'steps'}.${passo.chave}.body`)}
							</p>
						</li>
					))}
				</ol>

				<div className='mt-5 flex flex-wrap items-center gap-3'>
					{/* Link com a aparência do botão: o `Button` daqui não tem
					    `asChild`, e criar a prop só por esta tela seria API nova por
					    conveniência de uma chamada */}
					<Link
						to='/vagas/nova'
						className='inline-flex h-9 items-center rounded-lg bg-lime px-4 text-[13px] font-medium text-lime-ink transition-[filter] hover:brightness-95'
					>
						{t('firstRun.cta')}
					</Link>
					{saas && (
						<span className='text-[12.5px] text-text-2'>
							{t('firstRun.credits', { count: saldo })}
						</span>
					)}
				</div>
			</section>
		</div>
	)
}
