import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { Logo } from '@/components/logo'
import { cn } from '@/lib/cn'
import { getAuth } from '@/lib/auth'
import { Button } from '@/ui/button'

/**
 * Tom da mensagem segue a semântica (feedback do produto): vermelho SÓ pra
 * falha real; orientação de próximo passo é aviso (âmbar); sucesso é lime.
 */
type Feedback = { tone: 'danger' | 'amber' | 'lime'; text: string }

const FEEDBACK_STYLE: Record<Feedback['tone'], string> = {
	danger: 'bg-danger-soft text-danger',
	amber: 'bg-amber-soft text-amber',
	lime: 'bg-lime-soft text-lime-fg',
}

/**
 * Painel de marca (metade direita): sempre dark, e a "arte" é o próprio
 * produto — um card de candidato com a régua de etapas (a assinatura visual
 * do ats) flutuando. Personalidade sem decoração vazia.
 */
export function BrandPanel() {
	const { t } = useTranslation()
	return (
		// A classe `dark` faz o painel SER o tema escuro do app (mesmos tokens,
		// mesmo preto por construção) — o feedback era "os pretos parecem
		// diferentes" entre login e app logado; hex hardcoded nunca mais.
		<div className='dark relative hidden overflow-hidden bg-bg lg:flex lg:flex-col lg:items-center lg:justify-center'>
			{/* glow único e controlado — momento de marca, não blob decorativo */}
			<div className='pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-lime opacity-[0.09] blur-3xl' />

			<div className='relative z-10 max-w-md px-10'>
				<h2 className='font-display text-[32px] font-semibold leading-tight text-text'>
					<Trans
						i18nKey='login.brandHeadline'
						components={{ hl: <span className='text-lime' /> }}
						defaults='{{prefix}} <hl>{{highlight}}</hl>{{suffix}}'
						values={{
							prefix: t('login.brandHeadlinePrefix'),
							highlight: t('login.brandHeadlineHighlight'),
							suffix: t('login.brandHeadlineSuffix'),
						}}
					/>
				</h2>
				<p className='mt-3 text-[14px] leading-relaxed text-text-2'>
{t('login.brandSubtitle')}
				</p>

				{/* o produto dentro do login: card de candidato com a régua de etapas */}
				<div className='mt-10 animate-[login-float_6s_ease-in-out_infinite] rounded-xl border border-border bg-card p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]'>
					<div className='flex items-center gap-3'>
						<span className='flex h-9 w-9 items-center justify-center rounded-full bg-lime-soft text-[12px] font-semibold text-lime-fg'>
							MV
						</span>
						<div className='min-w-0 flex-1'>
							<p className='text-[13px] font-medium text-text'>{t('login.brandCardName')}</p>
							<p className='text-[11px] text-muted'>{t('login.brandCardRole')}</p>
						</div>
						<span className='rounded-full bg-lime-soft px-2 py-0.5 text-[11px] font-medium text-lime-fg'>
							{t('login.brandCardScore')}
						</span>
					</div>
					<div className='mt-3 flex items-center gap-1'>
						<span className='h-1.5 flex-[2] rounded-full bg-data-done/40' />
						<span className='h-1.5 flex-[3] rounded-full bg-lime' />
						<span className='h-1.5 flex-1 rounded-full bg-data-track' />
						<span className='h-1.5 flex-1 rounded-full bg-data-track' />
						<span className='h-1.5 flex-1 rounded-full bg-data-track' />
					</div>
					<div className='mt-2 flex items-center justify-between text-[11px] text-muted'>
						<span>{t('login.brandCardStatus')}</span>
						<span className='flex items-center gap-1.5'>
							<span className='h-1.5 w-1.5 rounded-full bg-lime' /> {t('login.brandCardSla')}
						</span>
					</div>
				</div>

				<p className='mt-10 text-[12px] text-muted'>
{t('login.brandFooter')}
				</p>
			</div>

			<style>{`
				@keyframes login-float {
					0%, 100% { transform: translateY(0); }
					50% { transform: translateY(-8px); }
				}
				@media (prefers-reduced-motion: reduce) {
					.animate-\\[login-float_6s_ease-in-out_infinite\\] { animation: none; }
				}
			`}</style>
		</div>
	)
}

export function LoginPage() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { destino } = useSearch({ strict: false }) as { destino?: string }
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [feedback, setFeedback] = useState<Feedback | null>(null)
	const [loading, setLoading] = useState(false)

	async function handleSubmit(event: FormEvent) {
		event.preventDefault()
		setFeedback(null)
		setLoading(true)
		try {
			await getAuth().login(email, password)
			/*
			 * Volta para onde a pessoa QUERIA ir. Quem chegou por um link de
			 * compartilhamento perdia o código ao passar pelo login e ia parar no
			 * dashboard — que o convidado nem pode abrir.
			 */
			await navigate({ to: destino ?? '/dashboard' })
		} catch {
			setFeedback({ tone: 'danger', text: t('login.errorCredentials') })
		} finally {
			setLoading(false)
		}
	}


	return (
		<div className='grid min-h-screen bg-bg lg:grid-cols-2'>
			<div className='flex items-center justify-center px-4 py-10'>
				<div className='w-full max-w-sm'>
					<div className='mb-6 flex flex-col items-start gap-3'>
						<Logo className='h-11' />
						<div>
							<h1 className='text-[22px]'>{t('login.welcome')}</h1>
							<p className='mt-1 text-[13px] text-text-2'>{t('login.subtitle')}</p>
						</div>
					</div>

					<form onSubmit={handleSubmit} className='flex flex-col gap-3'>
						<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
							{t('login.email')}
							<input
								type='email'
								required
								autoComplete='email'
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className='h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text transition-colors duration-150'
							/>
						</label>
						<label className='flex flex-col gap-1 text-[12px] font-medium text-text-2'>
							<span className='flex items-center justify-between'>
								{t('login.password')}
								{/*
								 * Link para tela própria, não botão que dispara daqui.
								 *
								 * O botão chamava `sendPasswordResetEmail` do Firebase: o
								 * e-mail saía com a marca do Firebase e o link levava a uma
								 * página hospedada deles, em inglês. Agora o pedido passa
								 * pelo core, o e-mail sai pelo Postmark com nosso template e
								 * as duas pontas do fluxo são telas do ATS.
								 */}
								<Link
									to='/esqueci-senha'
									className='text-[11px] font-medium text-lime-fg hover:underline'
								>
									{t('login.forgot')}
								</Link>
							</span>
							<input
								type='password'
								required
								autoComplete='current-password'
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								className='h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-text transition-colors duration-150'
							/>
						</label>

						{feedback && (
							<p
								role={feedback.tone === 'danger' ? 'alert' : 'status'}
								className={cn('rounded-lg px-3 py-2 text-[12px]', FEEDBACK_STYLE[feedback.tone])}
							>
								{feedback.text}
							</p>
						)}

						<Button type='submit' variant='primary' size='lg' disabled={loading} className='mt-2'>
							{loading ? t('login.submitting') : t('login.submit')}
						</Button>
					</form>

					<p className='mt-5 text-[12px] text-text-2'>
						{t('login.noAccount')}{' '}
						<Link to='/criar-conta' className='font-medium text-lime-fg hover:underline'>
							{t('login.signup')}
						</Link>
					</p>
				</div>
			</div>

			<BrandPanel />
		</div>
	)
}
