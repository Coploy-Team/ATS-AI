import { Check, Copy, Loader2, Plug, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import type { InstallationFeatures } from '@/lib/capabilities'
import { Button } from '@/ui/button'
import { Card } from '@/ui/page'

/**
 * Plugin Motor na tela Servidor — decisão 3 do ADR-009: a tela conta a
 * história inteira, sem pressupor conversa com a Coploy. Três momentos:
 *
 * 1. SEM licença — o que o Motor destrava + campo pra quem já tem chave.
 * 2. Licença ATIVA, Motor não instalado — instalação de UM comando
 *    (decisão 5: o instalador vem da própria licença) em passos numerados.
 * 3. Instalado — estado vivo de cada serviço, com nome de gente.
 *
 * Estados de licença ruim (inválida/revogada/servidor fora) mantêm a chave
 * visível e explicam o que fazer.
 */

const apiErrorMessage = (error: unknown): string | null => {
	const body = (error as { body?: { message?: string } } | null)?.body
	return body?.message ?? null
}

/** A sala roda no HOST (endereço público) — só o browser a alcança. */
function useInterviewAppAlive(url: string | null | undefined) {
	const [alive, setAlive] = useState<boolean | null>(null)
	useEffect(() => {
		if (!url) {
			setAlive(null)
			return
		}
		let cancelled = false
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 3000)
		// no-cors: resposta opaca basta — respondeu = está de pé
		fetch(url, { mode: 'no-cors', signal: controller.signal })
			.then(() => !cancelled && setAlive(true))
			.catch(() => !cancelled && setAlive(false))
			.finally(() => clearTimeout(timer))
		return () => {
			cancelled = true
			controller.abort()
		}
	}, [url])
	return alive
}

function StatusDot({ up }: { up: boolean | null }) {
	return (
		<span
			className={`inline-block h-2 w-2 shrink-0 rounded-full ${
				up === null ? 'bg-border' : up ? 'bg-lime-500' : 'bg-danger'
			}`}
		/>
	)
}

function CopyBlock({ text }: { text: string }) {
	const { t } = useTranslation()
	const [copied, setCopied] = useState(false)
	return (
		<div className='relative'>
			<pre className='overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surface px-3 py-2.5 pr-10 font-mono text-[11px] leading-relaxed text-text'>
				{text}
			</pre>
			<button
				type='button'
				title={t('server.plugin.copy')}
				onClick={() => {
					void navigator.clipboard.writeText(text)
					setCopied(true)
					setTimeout(() => setCopied(false), 2000)
				}}
				className='absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded border border-border bg-card text-text-2 hover:text-text'
			>
				{copied ? <Check size={12} /> : <Copy size={12} />}
			</button>
		</div>
	)
}

export function PluginCard({ features }: { features: InstallationFeatures }) {
	const { t } = useTranslation()
	const plugin = empresa.useGetSettingsInstancePlugin({
		query: { enabled: features.instanceConfig, retry: false },
	})
	const savePlugin = empresa.usePutSettingsInstancePlugin()
	const [licenseKey, setLicenseKey] = useState('')
	const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

	const status = plugin.data?.status === 200 ? plugin.data.data : null
	const license = status?.license ?? null
	const services = status?.services ?? null
	const interviewAlive = useInterviewAppAlive(services?.interviewBaseUrl)

	const saveLicense = (key: string) => {
		setFeedback(null)
		savePlugin.mutate(
			{ data: { licenseKey: key } },
			{
				onSuccess: (response) => {
					if (response.status !== 200) {
						setFeedback({
							tone: 'error',
							text:
								(response.data as { message?: string })?.message ?? t('server.plugin.saveError'),
						})
						return
					}
					void plugin.refetch()
					const saved = response.data.license
					if (!saved) setFeedback({ tone: 'ok', text: t('server.plugin.removed') })
					else if (saved.status === 'active') {
						setLicenseKey('')
						setFeedback({ tone: 'ok', text: t('server.plugin.activated') })
					} else setFeedback({ tone: 'error', text: t(`server.plugin.status.${saved.status}`) })
				},
				onError: (error) =>
					setFeedback({
						tone: 'error',
						text: apiErrorMessage(error) ?? t('server.plugin.saveError'),
					}),
			},
		)
	}

	const keyField = (
		<div className='flex flex-wrap items-end gap-2'>
			<label className='flex min-w-[260px] flex-1 flex-col gap-1'>
				<span className='text-[12px] font-medium text-text-2'>{t('server.plugin.keyLabel')}</span>
				<input
					className='font-num h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px]'
					value={licenseKey}
					onChange={(e) => setLicenseKey(e.target.value)}
					placeholder='cplm_…'
				/>
			</label>
			<Button
				disabled={savePlugin.isPending || !licenseKey.trim()}
				onClick={() => saveLicense(licenseKey.trim())}
			>
				{savePlugin.isPending ? <Loader2 size={13} className='animate-spin' /> : <Check size={13} />}
				{t('server.plugin.activate')}
			</Button>
		</div>
	)

	const feedbackLine = feedback && (
		<p className={feedback.tone === 'ok' ? 'text-[12.5px] text-lime-fg' : 'text-[12.5px] text-danger'}>
			{feedback.text}
		</p>
	)

	// ── estado 3: instalado — o painel vivo ──────────────────────────────────
	if (license?.status === 'active' && status?.motorInstalled) {
		const rows: Array<{ label: string; up: boolean | null }> = [
			{ label: t('server.plugin.svc.interview'), up: interviewAlive },
			{ label: t('server.plugin.svc.orchestrator'), up: services?.orchestrator ?? null },
			{ label: t('server.plugin.svc.engine'), up: services?.engine ?? null },
			{ label: t('server.plugin.svc.license'), up: true },
		]
		const allUp = rows.every((row) => row.up === true)
		return (
			<Card
				title={
					<span className='inline-flex items-center gap-1.5'>
						<Plug size={15} /> {t('server.plugin.title')}
					</span>
				}
				description={t('server.plugin.installedDescription')}
			>
				<div className='flex flex-col gap-3'>
					<div className='rounded-lg border border-border bg-surface px-3 py-2.5'>
						<p className='mb-2 text-[12.5px] font-semibold'>
							{allUp ? t('server.plugin.allUp') : t('server.plugin.someDown')}
						</p>
						<div className='flex flex-col gap-1.5'>
							{rows.map((row) => (
								<div key={row.label} className='flex items-center gap-2 text-[12.5px]'>
									<StatusDot up={row.up} />
									<span>{row.label}</span>
									{row.up === false && (
										<span className='text-[11.5px] text-danger'>{t('server.plugin.svcDown')}</span>
									)}
								</div>
							))}
						</div>
					</div>
					<p className='text-[12px] text-text-2'>
						{t('server.plugin.licenseLabel')}{' '}
						<span className='font-num font-medium'>{license.keyHint}</span>
						{license.plan && <span> · {t('server.plugin.plan')} {license.plan}</span>}
					</p>
					<div>
						<Button
							variant='secondary'
							size='sm'
							disabled={savePlugin.isPending}
							onClick={() => saveLicense('')}
						>
							{t('server.plugin.remove')}
						</Button>
					</div>
					{feedbackLine}
				</div>
			</Card>
		)
	}

	// ── estado 2: licença ativa, falta instalar — 1 comando ──────────────────
	if (license?.status === 'active' && !status?.motorInstalled) {
		const installCmd = `curl -H "Authorization: Bearer SUA_CHAVE" \\\n  ${status?.licenseServerUrl ?? ''}/plugin/motor/install | bash`
		return (
			<Card
				title={
					<span className='inline-flex items-center gap-1.5'>
						<Plug size={15} /> {t('server.plugin.title')}
					</span>
				}
				description={t('server.plugin.installDescription')}
			>
				<div className='flex flex-col gap-3'>
					<p className='text-[12.5px]'>
						<span className='font-semibold text-lime-fg'>{t('server.plugin.status.active')}</span>
						{license.plan && <span className='text-text-2'> · {t('server.plugin.plan')} {license.plan}</span>}
						{' · '}
						<span className='font-num'>{license.keyHint}</span>
					</p>
					<ol className='flex list-none flex-col gap-3 p-0'>
						<li className='flex gap-2.5'>
							<span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-text text-[11px] font-bold text-bg' style={{ background: 'var(--text)', color: 'var(--bg)' }}>1</span>
							<div className='min-w-0 flex-1'>
								<p className='text-[12.5px]'>{t('server.plugin.step1')}</p>
							</div>
						</li>
						<li className='flex gap-2.5'>
							<span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold' style={{ background: 'var(--text)', color: 'var(--bg)' }}>2</span>
							<div className='min-w-0 flex-1'>
								<p className='mb-1.5 text-[12.5px]'>{t('server.plugin.step2')}</p>
								<CopyBlock text={installCmd} />
								<p className='mt-1.5 text-[11.5px] text-muted'>{t('server.plugin.installerDoes')}</p>
							</div>
						</li>
						<li className='flex gap-2.5'>
							<span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold' style={{ background: 'var(--text)', color: 'var(--bg)' }}>3</span>
							<p className='text-[12.5px]'>{t('server.plugin.step3')}</p>
						</li>
					</ol>
					<div>
						<Button variant='secondary' size='sm' disabled={savePlugin.isPending} onClick={() => saveLicense('')}>
							{t('server.plugin.remove')}
						</Button>
					</div>
					{feedbackLine}
				</div>
			</Card>
		)
	}

	// ── licença com problema (inválida/revogada/servidor fora) ───────────────
	if (license) {
		return (
			<Card
				title={
					<span className='inline-flex items-center gap-1.5'>
						<Plug size={15} /> {t('server.plugin.title')}
					</span>
				}
				description={t('server.plugin.description')}
			>
				<div className='flex flex-col gap-3'>
					<div className='rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px]'>
						<p>
							{t('server.plugin.licenseLabel')}{' '}
							<span className='font-num font-medium'>{license.keyHint}</span> ·{' '}
							<span className='font-medium text-danger'>{t(`server.plugin.status.${license.status}`)}</span>
						</p>
						{license.lastError && <p className='mt-1 text-[12px] text-danger'>{license.lastError}</p>}
					</div>
					{keyField}
					<div>
						<Button variant='secondary' size='sm' disabled={savePlugin.isPending} onClick={() => saveLicense('')}>
							{t('server.plugin.remove')}
						</Button>
					</div>
					{feedbackLine}
				</div>
			</Card>
		)
	}

	// ── estado 1: sem licença — o que é o Motor + as duas portas ─────────────
	return (
		<Card
			title={
				<span className='inline-flex items-center gap-1.5'>
					<Plug size={15} /> {t('server.plugin.title')}
				</span>
			}
			description={t('server.plugin.pitchDescription')}
		>
			<div className='flex flex-col gap-3'>
				<ul className='flex flex-col gap-1.5 text-[12.5px] text-text-2'>
					{[0, 1, 2, 3].map((index) => (
						<li key={index} className='flex items-start gap-2'>
							<Sparkles size={12} className='mt-0.5 shrink-0 text-lime-fg' />
							<span>{t(`server.plugin.pitch.${index}`)}</span>
						</li>
					))}
				</ul>
				<a
					href='https://coploy.io?utm_source=open&utm_medium=servidor'
					target='_blank'
					rel='noopener noreferrer'
					className='w-fit text-[12.5px] font-semibold text-lime-fg hover:underline'
				>
					{t('server.plugin.hire')} →
				</a>
				<div className='border-t border-border pt-3'>
					<p className='mb-2 text-[12px] text-text-2'>{t('server.plugin.haveKey')}</p>
					{keyField}
				</div>
				{feedbackLine}
			</div>
		</Card>
	)
}
