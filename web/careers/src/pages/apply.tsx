import { useMutation } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { candidato, publico as publicoFetch } from '@coploy/sdk'
import { candidato as candidatoReact, publico } from '@coploy/sdk/react'

import { BrandButton, BrandTopbar, brandStyle } from '@/components/brand'
import { startInterview } from '@/lib/start-interview'
import { clearSession, getSession, saveSession } from '@/lib/api'
import { startProfileImport } from '@/lib/ots-profile-import'
import { cn } from '@/lib/cn'

type KnockoutAnswer = boolean | string | number

interface ApplyResult {
	created: boolean
	action: 'continue_interview' | 'rejected'
	rejectionReasonLabel: string | null
	rejectionEvidence: string | null
	/** Resultado do anexo da prova OTS — null/ausente quando não foi enviada. */
	otsAttestation?: { accepted: boolean; reason: string | null } | null
}

function Field({
	label,
	hint,
	children,
}: {
	label: string
	hint?: string
	children: React.ReactNode
}) {
	return (
		<label className='flex flex-col gap-1'>
			<span className='text-[12.5px] font-medium'>
				{label}
				{hint && <span className='ml-1.5 font-normal text-muted'>{hint}</span>}
			</span>
			{children}
		</label>
	)
}

/**
 * Provedor de origem do perfil portátil (OTS) — sem ele configurado o card
 * de import nem aparece. É build-time (Vite) porque o portal é estático.
 */
const OTS_PROFILE_PROVIDER = (import.meta.env.VITE_OTS_PROFILE_PROVIDER as string | undefined)?.replace(/\/$/, '') ?? ''

const inputClass =
	'h-10 rounded-lg border border-border bg-surface px-3 text-[13.5px] text-text outline-none transition-colors focus:border-[var(--brand)]'

/**
 * Candidatura com conta de candidato.
 *
 * A conta não é burocracia: é o que liga a candidatura a uma PESSOA — é como
 * o recrutador responde, como a candidatura aparece no pipeline com nome e
 * contato, e onde o currículo portátil (OTS) vai morar. Por isso o formulário
 * é um só: conta e candidatura se resolvem no mesmo clique.
 *
 * O knockout roda no servidor no MESMO POST da candidatura (apply-lite). O
 * resultado volta na hora e a tela diz a verdade: reprovado no filtro não é
 * "recebemos seus dados, boa sorte" — é "esta vaga exige X".
 */
export function ApplyPage() {
	const { t } = useTranslation()
	const { companyId, jobId } = useParams({ strict: false }) as {
		companyId: string
		jobId: string
	}

	const { data: jobData } = publico.useGetCareersCompanyIdJobsJobId(companyId, jobId)
	const job = jobData && jobData.status === 200 ? jobData.data.job : null
	const branding = jobData && jobData.status === 200 ? jobData.data.branding : null

	const [session, setSession] = useState(getSession())
	/*
	 * Pré-checagem: quem JÁ está neste processo (ou já foi reprovado) não deve
	 * ver o formulário de novo — preencher tudo pra descobrir no envio era a
	 * reclamação do primeiro teste real. Logado, a lista das próprias
	 * candidaturas responde antes do form aparecer.
	 */
	const { data: mine } = candidatoReact.useGetInterviewsMine({
		query: { enabled: Boolean(session) },
	})
	const existingApplication =
		mine?.status === 200
			? mine.data.companyInterviews.find((application) => application.jobId === jobId)
			: undefined
	const [tab, setTab] = useState<'create' | 'login'>('create')
	const [name, setName] = useState('')
	const [email, setEmail] = useState('')
	const [phone, setPhone] = useState('')
	const [password, setPassword] = useState('')
	const [resumeUrl, setResumeUrl] = useState('')
	/** Arquivo do currículo — sobe autenticado no submit e vira `resumeUrl`. */
	const [resumeFile, setResumeFile] = useState<File | null>(null)
	const [notes, setNotes] = useState('')
	/** Prova de entrevista verificada (OTS) — o candidato cola ou envia o .jws. */
	const [otsJws, setOtsJws] = useState('')
	/*
	 * Import de perfil OTS: o `?perfil=` na URL é o callback do OAuth contando
	 * como terminou — lido uma vez na montagem, porque a navegação de volta é
	 * um replace de página inteira.
	 */
	const [importState] = useState(
		() => new URLSearchParams(window.location.search).get('perfil'),
	)
	const [importStarting, setImportStarting] = useState(false)
	const [answers, setAnswers] = useState<Record<string, KnockoutAnswer>>({})
	const [error, setError] = useState<string | null>(null)
	const [result, setResult] = useState<ApplyResult | null>(null)

	/*
	 * Identificar é uma etapa PRÓPRIA, com botão e erro próprios, ANTES do
	 * formulário. A primeira versão fazia login dentro do envio da
	 * candidatura: a pessoa preenchia tudo, errava a senha e o erro aparecia
	 * lá embaixo, longe do campo — retrabalho e culpa no lugar errado
	 * (feedback do teste real). Errar a senha agora custa só a senha.
	 */
	const identify = useMutation({
		mutationFn: async () => {
			if (tab === 'create') {
				if (!name.trim() || !email.trim() || password.length < 6) {
					throw new Error(t('apply.missingFields'))
				}
				const created = await publicoFetch.postAuthCreate({
					name: name.trim(),
					email: email.trim(),
					password,
					phoneNumber: phone.trim() || undefined,
					language: 'pt-BR',
				}).catch(() => {
					throw new Error(t('apply.createFailed'))
				})
				return {
					token: created.data.token,
					refreshToken: created.data.refreshToken,
					uid: created.data.uid,
					name: name.trim(),
					email: email.trim(),
				}
			}
			const logged = await publicoFetch.postSessionsPassword({
				email: email.trim(),
				password,
			}).catch(() => {
				throw new Error(t('apply.loginFailed'))
			})
			return {
				token: logged.data.token,
				uid: '',
				/*
				 * VAZIO de propósito: quem loga não digitou o nome, e chutar o
				 * prefixo do e-mail aqui SOBRESCREVIA o nome real no perfil —
				 * o apply-lite grava o `name` que recebe. Sem nome, o backend
				 * mantém o que já sabe.
				 */
				name: '',
				email: email.trim(),
			}
		},
		onSuccess: (active) => {
			saveSession(active)
			setSession(active)
			setPassword('')
		},
	})

	const submit = useMutation({
		mutationFn: async (): Promise<ApplyResult> => {
			const active = session
			if (!active) throw new Error(t('apply.loginFailed'))

			/*
			 * Currículo em arquivo: sobe DEPOIS da sessão existir (a rota é
			 * autenticada) e a URL devolvida entra na candidatura como resumeUrl —
			 * arquivo escolhido vence o campo de link.
			 */
			let uploadedResumeUrl: string | undefined
			if (resumeFile) {
				const body = new FormData()
				body.append('resume', resumeFile)
				const uploaded = await candidato.postCareersResume({ body }).catch(() => {
					throw new Error(t('apply.resumeUploadFailed'))
				})
				uploadedResumeUrl =
					uploaded.status === 200 ? uploaded.data.resumeUrl : undefined
			}

			const response = await candidato.postCareersCompanyIdJobsJobIdApply(companyId, jobId, {
				name: active.name || undefined,
				email: active.email || undefined,
				phone: phone.trim() || undefined,
				resumeUrl: uploadedResumeUrl ?? (resumeUrl.trim() || undefined),
				notes: notes.trim() || undefined,
				knockoutAnswers: Object.keys(answers).length > 0 ? answers : undefined,
				otsAttestationJws: otsJws.trim() || undefined,
				source: 'careers',
			}).catch(() => {
				throw new Error(t('apply.applyFailed'))
			})

			// Token vence em 1h: status ANTES do corpo (gotcha conhecido — 401
			// parece campo ausente). Sessão morta volta pra etapa de entrar.
			// O cast existe porque o contrato só declara 200/404 — o 401 vem do
			// middleware de auth, fora do schema da rota.
			const status = response.status as number
			if (status === 401) {
				clearSession()
				setSession(null)
				throw new Error(t('apply.sessionExpired'))
			}
			if (status !== 200) throw new Error(t('apply.applyFailed'))

			return response.data as ApplyResult
		},
		onSuccess: setResult,
		onError: (err) => setError(err instanceof Error ? err.message : t('apply.applyFailed')),
	})

	if (!job) return <div className='h-64 animate-pulse rounded-xl bg-card-alt' />

	// candidatura existente detectada ANTES do form: mostra o estado dela
	const effectiveResult: ApplyResult | null =
		result ??
		(existingApplication
			? {
					created: false,
					action: existingApplication.rejectionExplanation ? 'rejected' : 'continue_interview',
					rejectionReasonLabel: existingApplication.failedRequirementLabel ?? null,
					rejectionEvidence: existingApplication.rejectionExplanation ?? null,
				}
			: null)

	// ── resultado ─────────────────────────────────────────────────────────────
	if (effectiveResult) {
		const result = effectiveResult
		const rejected = result.action === 'rejected'
		const already = !result.created && !rejected
		return (
			<div
				style={brandStyle(branding)}
				className='flex flex-col items-center gap-3 py-20 text-center'
			>
				{rejected ? (
					<XCircle size={36} className='text-danger' />
				) : already ? (
					<Info size={36} className='text-text-2' />
				) : (
					<CheckCircle2 size={36} className='text-lime-fg' />
				)}
				<h1 className='font-display text-[20px] font-semibold tracking-tight'>
					{t(rejected ? 'apply.rejectedTitle' : already ? 'apply.alreadyTitle' : 'apply.doneTitle')}
				</h1>
				<p className='max-w-md text-[13.5px] leading-relaxed text-text-2'>
					{rejected
						? t('apply.rejectedBody')
						: already
							? t('apply.alreadyBody')
							: t('apply.doneBody', { job: job.title, email: session?.email ?? '' })}
				</p>
				{rejected && (result.rejectionReasonLabel || result.rejectionEvidence) && (
					<p className='max-w-md rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px]'>
						{result.rejectionReasonLabel ?? result.rejectionEvidence}
					</p>
				)}
				{rejected && <p className='max-w-md text-[12px] text-muted'>{t('apply.rejectedHint')}</p>}
				{/* A candidatura vale de qualquer jeito — a prova ter falhado é
				    informação, não punição, e a pessoa merece saber o quê houve. */}
				{result.otsAttestation && (
					<p
						className={cn(
							'max-w-md rounded-lg border px-4 py-2.5 text-[12.5px]',
							result.otsAttestation.accepted
								? 'border-border bg-surface'
								: 'border-amber-300/50 bg-amber-50/50 text-amber-800 dark:bg-transparent dark:text-amber-400',
						)}
					>
						{result.otsAttestation.accepted
							? t('apply.otsAccepted')
							: t('apply.otsRejected')}
					</p>
				)}
				{/* decisão 1: a entrevista começa AQUI, pela porta do portal — a
				    sala recebe o candidato já autenticado via bilhete de uso único */}
				{!rejected && job.interviewReady && (
					<BrandButton size='lg' onClick={() => void startInterview(job.interviewUrl)}>
						{t('apply.startInterview')}
					</BrandButton>
				)}
				<div className='mt-2 flex flex-wrap items-center justify-center gap-4'>
					<Link
						to='/minhas-candidaturas'
						className='text-[13px] font-medium text-lime-fg hover:underline'
					>
						{t('apply.track')}
					</Link>
					<Link
						to='/$companyId'
						params={{ companyId }}
						className='text-[13px] font-medium text-lime-fg hover:underline'
					>
						{t('apply.doneAnother')}
					</Link>
				</div>
			</div>
		)
	}

	// ── formulário ────────────────────────────────────────────────────────────
	return (
		<div style={brandStyle(branding)} className='pb-16'>
			<BrandTopbar branding={branding} companyId={companyId} />
			<div className='mx-auto mt-8 flex w-full max-w-3xl flex-col gap-5 px-4 sm:px-6'>
			<Link
				to='/$companyId/vagas/$jobId'
				params={{ companyId, jobId }}
				className='inline-flex items-center gap-1.5 text-[12.5px] text-text-2 transition-colors hover:text-text'
			>
				<ArrowLeft size={13} /> {job.title}
			</Link>

			<h1 className='font-display text-[20px] font-semibold tracking-tight'>
				{t('apply.title', { job: job.title })}
			</h1>

			{/*
			 * DUAS etapas, não um formulário só. Identificar vem antes e tem botão
			 * e erro PRÓPRIOS: errar a senha custa a senha, não o formulário
			 * inteiro preenchido (feedback do teste real — o erro aparecia no
			 * rodapé, longe do campo).
			 */}
			{!session ? (
				<form
					className='flex flex-col gap-5'
					onSubmit={(event) => {
						event.preventDefault()
						identify.mutate()
					}}
				>
					<section className='rounded-xl border border-border bg-card p-4'>
						<h2 className='text-[13.5px] font-semibold'>{t('apply.accountTitle')}</h2>
						<p className='mt-0.5 text-[12px] leading-relaxed text-text-2'>
							{t('apply.accountHint')}
						</p>

						<div className='mt-3 flex gap-1 rounded-lg border border-border bg-surface p-1 text-[12.5px]'>
							{(['create', 'login'] as const).map((value) => (
								<button
									key={value}
									type='button'
									onClick={() => setTab(value)}
									className={cn(
										'flex-1 rounded-md px-3 py-1.5 transition-colors',
										tab === value ? 'bg-sel font-medium' : 'text-text-2 hover:text-text',
									)}
								>
									{t(value === 'create' ? 'apply.tabCreate' : 'apply.tabLogin')}
								</button>
							))}
						</div>

						<div className='mt-3 grid gap-3 sm:grid-cols-2'>
							{tab === 'create' && (
								<Field label={t('apply.name')}>
									<input
										className={inputClass}
										value={name}
										onChange={(e) => setName(e.target.value)}
										autoComplete='name'
									/>
								</Field>
							)}
							<Field label={t('apply.email')}>
								<input
									type='email'
									className={inputClass}
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									autoComplete='email'
								/>
							</Field>
							{tab === 'create' && (
								<Field label={t('apply.phone')}>
									<input
										className={inputClass}
										value={phone}
										onChange={(e) => setPhone(e.target.value)}
										autoComplete='tel'
									/>
								</Field>
							)}
							<Field label={t('apply.password')} hint={t('apply.passwordHint')}>
								<input
									type='password'
									className={inputClass}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									autoComplete={tab === 'create' ? 'new-password' : 'current-password'}
								/>
							</Field>
						</div>

						{/* o erro mora AQUI, colado nos campos que o causaram */}
						{identify.isError && (
							<p className='mt-3 text-[13px] text-danger'>
								{identify.error instanceof Error
									? identify.error.message
									: t('apply.loginFailed')}
							</p>
						)}

						<div className='mt-4'>
							<BrandButton type='submit' disabled={identify.isPending}>
								{identify.isPending
									? t('apply.identifying')
									: t(tab === 'create' ? 'apply.createAndContinue' : 'apply.loginAndContinue')}
							</BrandButton>
						</div>
					</section>
				</form>
			) : (
			<form
				className='flex flex-col gap-5'
				onSubmit={(event) => {
					event.preventDefault()
					setError(null)
					submit.mutate()
				}}
			>
				{/* barra fina de identidade: quem sou eu + como trocar */}
				<p className='flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px]'>
					{t('apply.loggedInAs')} <span className='font-medium'>{session.email}</span>
					<button
						type='button'
						onClick={() => {
							clearSession()
							setSession(null)
						}}
						className='text-[12px] text-lime-fg hover:underline'
					>
						{t('apply.changeAccount')}
					</button>
				</p>

				{/*
				 * Import do perfil OTS: a trajetória vem do provedor de origem em
				 * vez de ser redigitada — é o que enche o dossiê que o recrutador
				 * vê. Só aparece com provedor configurado, e some depois que o
				 * import desta visita deu certo (a mensagem de ✓ fica no lugar).
				 */}
				{OTS_PROFILE_PROVIDER && importState !== 'importado' && (
					<div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3'>
						<div className='min-w-0'>
							<p className='text-[13px] font-medium'>{t('profileImport.title')}</p>
							<p className='mt-0.5 text-[12px] leading-relaxed text-text-2'>
								{importState === 'vazio'
									? t('profileImport.emptyResult')
									: t('profileImport.hint')}
							</p>
						</div>
						<button
							type='button'
							disabled={importStarting}
							onClick={async () => {
								setImportStarting(true)
								try {
									await startProfileImport(OTS_PROFILE_PROVIDER, window.location.pathname)
								} catch {
									setImportStarting(false)
									setError(t('profileImport.startFailed'))
								}
							}}
							className='shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:border-[var(--brand)] disabled:opacity-50'
						>
							{importStarting ? (
								<Loader2 size={13} className='inline animate-spin' />
							) : (
								t('profileImport.action')
							)}
						</button>
					</div>
				)}
				{importState === 'importado' && (
					<p className='rounded-xl border border-border bg-card px-4 py-2.5 text-[12.5px]'>
						{t('profileImport.done')}
					</p>
				)}

				{/* filtro da vaga */}
				{job.knockoutQuestions.length > 0 && (
					<section className='rounded-xl border border-border bg-card p-4'>
						<h2 className='text-[13.5px] font-semibold'>{t('apply.screeningTitle')}</h2>
						<p className='mt-0.5 text-[12px] leading-relaxed text-text-2'>
							{t('apply.screeningHint')}
						</p>
						<div className='mt-3 flex flex-col gap-4'>
							{job.knockoutQuestions.map((question) => (
								<div key={question.id}>
									<p className='text-[13px] font-medium'>{question.question}</p>
									{question.type === 'boolean' && (
										<div className='mt-1.5 flex gap-2'>
											{([true, false] as const).map((value) => (
												<button
													key={String(value)}
													type='button'
													onClick={() =>
														setAnswers((current) => ({ ...current, [question.id]: value }))
													}
													className={cn(
														'rounded-lg border px-4 py-1.5 text-[12.5px] transition-colors',
														answers[question.id] === value
															? 'border-[var(--brand)] font-medium'
															: 'border-border text-text-2 hover:text-text',
													)}
												>
													{t(value ? 'apply.yes' : 'apply.no')}
												</button>
											))}
										</div>
									)}
									{question.type === 'single-choice' && (
										<select
											className={cn(inputClass, 'mt-1.5 w-full')}
											value={String(answers[question.id] ?? '')}
											onChange={(e) =>
												setAnswers((current) => ({ ...current, [question.id]: e.target.value }))
											}
										>
											<option value='' disabled>
												—
											</option>
											{(question.options ?? []).map((option) => (
												<option key={option} value={option}>
													{option}
												</option>
											))}
										</select>
									)}
									{question.type === 'number' && (
										<input
											type='number'
											className={cn(inputClass, 'mt-1.5 w-full sm:w-48')}
											value={String(answers[question.id] ?? '')}
											onChange={(e) =>
												setAnswers((current) => ({
													...current,
													[question.id]: e.target.value === '' ? '' : Number(e.target.value),
												}))
											}
										/>
									)}
								</div>
							))}
						</div>
					</section>
				)}

				{/* complementos */}
				<section className='rounded-xl border border-border bg-card p-4'>
					<h2 className='text-[13.5px] font-semibold'>{t('apply.extrasTitle')}</h2>
					<div className='mt-3 flex flex-col gap-3'>
						<Field label={t('apply.resumeFile')} hint={t('apply.resumeFileHint')}>
							<label className='flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-3 text-[13px] text-text-2 transition-colors hover:border-[var(--brand)]'>
								<input
									type='file'
									accept='.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
									className='hidden'
									onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
								/>
								{resumeFile ? (
									<span className='truncate font-medium text-text'>{resumeFile.name}</span>
								) : (
									t('apply.resumeFilePick')
								)}
							</label>
						</Field>
						<Field label={t('apply.resumeUrl')} hint={t('apply.resumeUrlHint')}>
							<input
								type='url'
								className={inputClass}
								value={resumeUrl}
								onChange={(e) => setResumeUrl(e.target.value)}
								placeholder='https://…'
							/>
						</Field>
						<Field label={t('apply.notes')}>
							<textarea
								rows={3}
								className='rounded-lg border border-border bg-surface px-3 py-2 text-[13.5px] text-text outline-none transition-colors focus:border-lime-mid'
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
							/>
						</Field>
						{/* Prova OTS: cola o documento ou envia o .jws — o arquivo só
						    preenche o mesmo campo, é UMA prova nos dois caminhos. */}
						<Field label={t('apply.otsJws')} hint={t('apply.otsJwsHint')}>
							<textarea
								rows={2}
								className='break-all rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[11px] text-text outline-none transition-colors focus:border-[var(--brand)]'
								value={otsJws}
								onChange={(e) => setOtsJws(e.target.value)}
								placeholder='eyJhbGciOiJFZERTQSJ9…'
							/>
							<label className='mt-1 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[12px] text-text-2 transition-colors hover:text-text'>
								<input
									type='file'
									accept='.jws,.txt'
									className='hidden'
									onChange={async (e) => {
										const file = e.target.files?.[0]
										if (file) setOtsJws((await file.text()).trim())
									}}
								/>
								{t('apply.otsJwsPick')}
							</label>
						</Field>
					</div>
				</section>

				{error && <p className='text-[13px] text-danger'>{error}</p>}

				<BrandButton type='submit' size='lg' disabled={submit.isPending}>
					{submit.isPending ? t('apply.submitting') : t('apply.submit')}
				</BrandButton>
			</form>
			)}
			</div>
		</div>
	)
}
