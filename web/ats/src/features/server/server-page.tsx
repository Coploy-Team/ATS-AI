import { Check, Loader2, Mail, Plug, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { Field, Select } from '@/features/job-form/fields'
import { Button } from '@/ui/button'
import { Card, Page } from '@/ui/page'

/**
 * Servidor — configuração da INSTALAÇÃO (distribuição open, só o dono vê).
 *
 * Adendo do Henrique na revisão da open (2026-08-22): as coisas de operador
 * (transporte de e-mail, plugin do Motor, adicionais) precisam de uma casa
 * própria que não se mistura com a configuração da EMPRESA — configurar SMTP
 * não é decidir régua de etapa. No SaaS esta tela não existe: quem opera o
 * servidor lá é a Coploy (feature `instanceConfig`).
 */

interface SmtpForm {
	host: string
	port: string
	secure: boolean
	user: string
	pass: string
	from: string
}

const apiErrorMessage = (error: unknown): string | null => {
	const body = (error as { body?: { message?: string } } | null)?.body
	return body?.message ?? null
}

const EMPTY: SmtpForm = { host: '', port: '587', secure: false, user: '', pass: '', from: '' }

export function ServerPage() {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const { data, refetch, error: loadError } = empresa.useGetSettingsInstanceEmail({
		query: { enabled: features.instanceConfig, retry: false },
	})
	const save = empresa.usePutSettingsInstanceEmail()
	const test = empresa.usePostSettingsInstanceEmailTest()
	const plugin = empresa.useGetSettingsInstancePlugin({
		query: { enabled: features.instanceConfig, retry: false },
	})
	const savePlugin = empresa.usePutSettingsInstancePlugin()

	const status = data?.status === 200 ? data.data : null
	const [form, setForm] = useState<SmtpForm>(EMPTY)
	const [testTo, setTestTo] = useState('')
	const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
	const [licenseKey, setLicenseKey] = useState('')
	const [pluginFeedback, setPluginFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

	// preenche o formulário com o salvo UMA vez por carga (senha nunca volta)
	useEffect(() => {
		if (status?.smtp) {
			setForm({
				host: status.smtp.host,
				port: String(status.smtp.port),
				secure: status.smtp.secure,
				user: status.smtp.user ?? '',
				pass: '',
				from: status.smtp.from,
			})
		}
	}, [status?.smtp])

	const set = <K extends keyof SmtpForm>(key: K, value: SmtpForm[K]) =>
		setForm((current) => ({ ...current, [key]: value }))

	const smtpBody = () => ({
		host: form.host.trim(),
		port: Number(form.port) || 587,
		secure: form.secure,
		user: form.user.trim() || null,
		// vazio = mantém a senha salva (a tela nunca a recebe de volta)
		pass: form.pass || null,
		from: form.from.trim(),
	})

	/*
	 * O dono é checado no SERVIDOR (a rota recusa quem não é) — aqui só se
	 * traduz a recusa. Esconder o menu de quem não pode já aconteceu no
	 * sidebar via capability.
	 */
	const forbidden = Boolean(loadError)

	return (
		<Page title={t('server.title')} subtitle={t('server.subtitle')}>
			{forbidden ? (
				<Card>
					<p className='py-6 text-center text-[13px] text-text-2'>{t('server.ownerOnly')}</p>
				</Card>
			) : (
				<div className='grid items-start gap-4 xl:grid-cols-2'>
					<Card
						title={
							<span className='inline-flex items-center gap-1.5'>
								<Mail size={15} /> {t('server.email.title')}
							</span>
						}
						description={t('server.email.description')}
					>
						<p className='mb-3 rounded-lg border border-border bg-surface px-3 py-2 text-[12px]'>
							{t('server.email.activeTransport')}:{' '}
							<span className='font-medium'>
								{t(`server.email.transport.${status?.activeTransport ?? 'none'}`)}
							</span>
							{(status?.activeTransport ?? 'none') === 'none' && (
								<span className='text-danger'> — {t('server.email.noneWarning')}</span>
							)}
						</p>

						<div className='grid gap-3 sm:grid-cols-2'>
							<Field label={t('server.email.host')}>
								<input
									className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px]'
									value={form.host}
									onChange={(e) => set('host', e.target.value)}
									placeholder='smtp.seudominio.com'
								/>
							</Field>
							<div className='grid grid-cols-2 gap-3'>
								<Field label={t('server.email.port')}>
									<input
										className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px]'
										value={form.port}
										onChange={(e) => set('port', e.target.value.replace(/\D/g, ''))}
									/>
								</Field>
								<Field label={t('server.email.secure')} hint='TLS'>
									<Select
										value={form.secure ? 'true' : 'false'}
										onChange={(value) => set('secure', value === 'true')}
										options={[
											{ value: 'false', label: t('server.email.secureStarttls') },
											{ value: 'true', label: t('server.email.secureImplicit') },
										]}
									/>
								</Field>
							</div>
							<Field label={t('server.email.user')} hint={t('server.email.optional')}>
								<input
									className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px]'
									value={form.user}
									onChange={(e) => set('user', e.target.value)}
									autoComplete='off'
								/>
							</Field>
							<Field label={t('server.email.pass')} hint={t('server.email.optional')}>
								<input
									type='password'
									className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px]'
									value={form.pass}
									onChange={(e) => set('pass', e.target.value)}
									placeholder={status?.smtp?.hasPassword ? '••••••••' : ''}
									autoComplete='new-password'
								/>
							</Field>
							<Field label={t('server.email.from')} className='sm:col-span-2'>
								<input
									className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px]'
									value={form.from}
									onChange={(e) => set('from', e.target.value)}
									placeholder='Recrutamento <rh@suaempresa.com>'
								/>
							</Field>
						</div>

						<div className='mt-4 flex flex-wrap items-center gap-2'>
							<Button
								variant='primary'
								disabled={save.isPending || !form.host.trim() || !form.from.trim()}
								onClick={() =>
									save.mutate(
										{ data: { smtp: smtpBody() } },
										{
											// status DECLARADO no contrato resolve (não lança): sucesso
											// só é sucesso com 200, e o corpo do erro traz o motivo real
											onSuccess: (response) => {
												if (response.status === 200) {
													setFeedback({ tone: 'ok', text: t('server.email.saved') })
													void refetch()
												} else {
													setFeedback({
														tone: 'error',
														text:
															(response.data as { message?: string })?.message ??
															t('server.email.saveFailed'),
													})
												}
											},
											onError: (error) =>
												setFeedback({
													tone: 'error',
													text: apiErrorMessage(error) ?? t('server.email.saveFailed'),
												}),
										},
									)
								}
							>
								{save.isPending ? <Loader2 size={13} className='animate-spin' /> : <Check size={13} />}
								{t('server.email.save')}
							</Button>

							<div className='ml-auto flex items-center gap-2'>
								<input
									type='email'
									className='h-8 w-52 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
									value={testTo}
									onChange={(e) => setTestTo(e.target.value)}
									placeholder={t('server.email.testPlaceholder')}
								/>
								<Button
									size='sm'
									disabled={test.isPending || !testTo || !form.host.trim()}
									onClick={() =>
										test.mutate(
											{ data: { to: testTo, smtp: smtpBody() } },
											{
												onSuccess: (response) =>
													setFeedback(
														response.status === 200
															? { tone: 'ok', text: t('server.email.testSent') }
															: {
																	tone: 'error',
																	// o motivo real do provedor destrava (auth, porta, TLS)
																	text:
																		(response.data as { message?: string })?.message ??
																		t('server.email.testFailed'),
																},
													),
												onError: (error) =>
													setFeedback({
														tone: 'error',
														text: apiErrorMessage(error) ?? t('server.email.testFailed'),
													}),
											},
										)
									}
								>
									{test.isPending ? (
										<Loader2 size={13} className='animate-spin' />
									) : (
										<Send size={13} />
									)}
									{t('server.email.sendTest')}
								</Button>
							</div>
						</div>
						{feedback && (
							<p
								className={
									feedback.tone === 'ok'
										? 'mt-2 text-[12.5px] text-lime-fg'
										: 'mt-2 text-[12.5px] text-danger'
								}
							>
								{feedback.text}
							</p>
						)}
					</Card>

					{/* licença do plugin Motor (ADR-008, fase 1) */}
					<Card
						title={
							<span className='inline-flex items-center gap-1.5'>
								<Plug size={15} /> {t('server.plugin.title')}
							</span>
						}
						description={t('server.plugin.description')}
					>
						{(() => {
							const pluginStatus = plugin.data?.status === 200 ? plugin.data.data : null
							const license = pluginStatus?.license ?? null
							const saveLicense = (key: string) => {
								setPluginFeedback(null)
								savePlugin.mutate(
									{ data: { licenseKey: key } },
									{
										onSuccess: (response) => {
											if (response.status !== 200) {
												setPluginFeedback({
													tone: 'error',
													text:
														(response.data as { message?: string })?.message ??
														t('server.plugin.saveError'),
												})
												return
											}
											void plugin.refetch()
											const status = response.data.license?.status
											if (!response.data.license) {
												setPluginFeedback({ tone: 'ok', text: t('server.plugin.removed') })
											} else if (status === 'active') {
												setLicenseKey('')
												setPluginFeedback({ tone: 'ok', text: t('server.plugin.activated') })
											} else {
												setPluginFeedback({
													tone: 'error',
													text: t(`server.plugin.status.${status}`),
												})
											}
										},
										onError: (error) =>
											setPluginFeedback({
												tone: 'error',
												text: apiErrorMessage(error) ?? t('server.plugin.saveError'),
											}),
									},
								)
							}
							return (
								<div className='flex flex-col gap-3'>
									{/* estado 1: os serviços do Motor (envs) — separado da licença */}
									<p className='rounded-lg border border-border bg-surface px-3 py-2 text-[12px]'>
										{t('server.plugin.motorStatus')}:{' '}
										<span className='font-medium'>
											{t(features.motor ? 'server.plugin.installed' : 'server.plugin.notInstalled')}
										</span>
									</p>

									{/* estado 2: a licença */}
									{license ? (
										<div className='rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px]'>
											<p>
												{t('server.plugin.licenseLabel')}{' '}
												<span className='font-num font-medium'>{license.keyHint}</span> ·{' '}
												<span
													className={
														license.status === 'active'
															? 'font-medium text-lime-fg'
															: 'font-medium text-danger'
													}
												>
													{t(`server.plugin.status.${license.status}`)}
												</span>
												{license.plan && (
													<span className='text-text-2'>
														{' '}
														· {t('server.plugin.plan')} {license.plan}
													</span>
												)}
											</p>
											{license.lastError && (
												<p className='mt-1 text-[12px] text-danger'>{license.lastError}</p>
											)}
											<div className='mt-2 flex gap-2'>
												<Button
													variant='secondary'
													size='sm'
													disabled={savePlugin.isPending}
													onClick={() => saveLicense('')}
												>
													{t('server.plugin.remove')}
												</Button>
											</div>
										</div>
									) : (
										<p className='text-[12.5px] leading-relaxed text-text-2'>
											{t('server.plugin.howTo')}
										</p>
									)}

									<div className='flex flex-wrap items-end gap-2'>
										<Field label={t('server.plugin.keyLabel')} className='min-w-[260px] flex-1'>
											<input
												className='font-num h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px]'
												value={licenseKey}
												onChange={(e) => setLicenseKey(e.target.value)}
												placeholder='cplm_…'
											/>
										</Field>
										<Button
											disabled={savePlugin.isPending || !licenseKey.trim()}
											onClick={() => saveLicense(licenseKey.trim())}
										>
											{savePlugin.isPending ? (
												<Loader2 size={13} className='animate-spin' />
											) : (
												<Check size={13} />
											)}
											{t('server.plugin.activate')}
										</Button>
									</div>

									{pluginFeedback && (
										<p
											className={
												pluginFeedback.tone === 'ok'
													? 'text-[12.5px] text-lime-fg'
													: 'text-[12.5px] text-danger'
											}
										>
											{pluginFeedback.text}
										</p>
									)}
								</div>
							)
						})()}
					</Card>
				</div>
			)}
		</Page>
	)
}
