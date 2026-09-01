import { Link } from '@tanstack/react-router'
import { CheckCircle2, ClipboardList, Clock, LogOut, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { publico as publicoFetch } from '@coploy/sdk'
import { candidato } from '@coploy/sdk/react'

import { startInterview } from '@/lib/start-interview'
import { CONTAINER } from '@/components/brand'
import { clearSession, getSession, saveSession } from '@/lib/api'

/**
 * Acompanhamento do candidato DENTRO do portal — a peça de anti-ghosting da
 * distribuição open (decisão registrada no ADR-007: a área completa do
 * candidato — currículo vivo, trajetória, entrevista de perfil — é produto da
 * REDE Coploy; a instância open guarda os candidatos DELA e mostra a eles o
 * andamento do próprio processo, nada mais).
 *
 * A tela mostra o que o candidato tem direito de ver: que a candidatura
 * existe, quando foi, e o retorno quando houver. A etapa interna do pipeline
 * é da empresa — quem fala com o candidato é o e-mail de anti-ghosting.
 */
export function ApplicationsPage() {
	const { t } = useTranslation()
	const [session, setSession] = useState(getSession())
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [loggingIn, setLoggingIn] = useState(false)

	const { data, isLoading } = candidato.useGetInterviewsMine({
		query: { enabled: Boolean(session) },
	})

	async function login() {
		setLoggingIn(true)
		setError(null)
		try {
			const logged = await publicoFetch.postSessionsPassword({
				email: email.trim(),
				password,
			})
			const next = {
				token: logged.data.token,
				uid: '',
				name: '',
				email: email.trim(),
			}
			saveSession(next)
			setSession(next)
		} catch {
			setError(t('applications.loginFailed'))
		} finally {
			setLoggingIn(false)
		}
	}

	// ── sem sessão: entrar pra acompanhar ────────────────────────────────────
	if (!session) {
		return (
			<div className={`${CONTAINER} py-14`}>
				<div className='mx-auto max-w-sm'>
					<h1 className='font-display text-[20px] font-semibold tracking-tight'>
						{t('applications.title')}
					</h1>
					<p className='mt-1 text-[13px] text-text-2'>{t('applications.loginHint')}</p>
					<form
						className='mt-4 flex flex-col gap-3'
						onSubmit={(event) => {
							event.preventDefault()
							void login()
						}}
					>
						<input
							type='email'
							placeholder={t('apply.email')}
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className='h-10 rounded-lg border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-lime-mid'
						/>
						<input
							type='password'
							placeholder={t('apply.password')}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className='h-10 rounded-lg border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-lime-mid'
						/>
						{error && <p className='text-[12.5px] text-danger'>{error}</p>}
						<button
							type='submit'
							disabled={loggingIn}
							className='h-10 rounded-lg bg-lime text-[13.5px] font-medium text-lime-ink transition-[filter] hover:brightness-95 disabled:opacity-60'
						>
							{t('applications.login')}
						</button>
					</form>
				</div>
			</div>
		)
	}

	const payload = data?.status === 200 ? data.data : null
	const applications = payload?.companyInterviews ?? []

	return (
		<div className={`${CONTAINER} py-10`}>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<div>
					<h1 className='font-display text-[20px] font-semibold tracking-tight'>
						{t('applications.title')}
					</h1>
					<p className='text-[12.5px] text-text-2'>{session.email}</p>
				</div>
				<button
					type='button'
					onClick={() => {
						clearSession()
						setSession(null)
					}}
					className='inline-flex items-center gap-1.5 text-[12.5px] text-text-2 transition-colors hover:text-text'
				>
					<LogOut size={13} /> {t('applications.logout')}
				</button>
			</div>

			{isLoading && <div className='mt-6 h-24 animate-pulse rounded-xl bg-card-alt' />}

			{!isLoading && applications.length === 0 && (
				<div className='mt-6 rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center'>
					<ClipboardList size={20} className='mx-auto mb-2 text-muted' />
					<p className='text-[13.5px] font-medium'>{t('applications.empty')}</p>
					<p className='mt-1 text-[12.5px] text-text-2'>{t('applications.emptyHint')}</p>
				</div>
			)}

			<ul className='mt-6 flex flex-col gap-3'>
				{applications.map((application) => {
					const rejected = Boolean(application.rejectionExplanation)
					return (
						<li
							key={application.id}
							className='rounded-xl border border-border bg-card p-4 sm:p-5'
						>
							<div className='flex flex-wrap items-start justify-between gap-3'>
								<div className='flex min-w-0 items-center gap-3'>
									{application.companyLogo && (
										<img
											src={application.companyLogo}
											alt=''
											className='h-10 w-10 shrink-0 rounded-lg border border-border object-cover'
										/>
									)}
									<div className='min-w-0'>
										<p className='truncate text-[14.5px] font-semibold'>
											{application.jobName ?? '—'}
										</p>
										<p className='truncate text-[12.5px] text-text-2'>
											{application.companyName ?? ''}
										</p>
									</div>
								</div>
								<span
									className={
										'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium ' +
										(rejected
											? 'bg-danger-soft text-danger'
											: application.finished
												? 'bg-lime-soft text-lime-fg'
												: 'border border-border text-text-2')
									}
								>
									{rejected ? (
										<XCircle size={11} />
									) : application.finished ? (
										<CheckCircle2 size={11} />
									) : (
										<Clock size={11} />
									)}
									{t(
										rejected
											? 'applications.status.rejected'
											: application.finished
												? 'applications.status.done'
												: 'applications.status.received',
									)}
								</span>
							</div>

							{application.startedAt && (
								<p className='mt-2 text-[11.5px] text-muted'>
									{t('applications.appliedAt', {
										date: new Date(application.startedAt).toLocaleDateString(),
									})}
								</p>
							)}

							{/* reprovação com retorno: o motivo que a empresa registrou */}
							{application.rejectionExplanation && (
								<p className='mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-text-2'>
									{application.rejectionExplanation}
								</p>
							)}

							{/* entrevista pendente e vaga pronta → continuar daqui, já autenticado */}
							{!rejected &&
								!application.finished &&
								application.interviewUrl &&
								(application.questionsTotal ?? 0) > 0 && (
									<button
										type='button'
										onClick={() => void startInterview(application.interviewUrl as string)}
										className='mt-3 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold'
										style={{ background: 'var(--brand, #cdfb12)', color: 'var(--brand-ink, #171a10)' }}
									>
										{t('applications.startInterview')}
									</button>
								)}
							{application.companyId && (
								<Link
									to='/$companyId'
									params={{ companyId: application.companyId }}
									className='mt-3 ml-3 inline-block text-[12.5px] font-medium text-lime-fg hover:underline'
								>
									{t('applications.companyJobs')}
								</Link>
							)}
						</li>
					)
				})}
			</ul>
		</div>
	)
}
