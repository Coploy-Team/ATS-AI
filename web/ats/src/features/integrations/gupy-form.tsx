import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Loader2, Plug, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { Field } from '@/features/job-form/fields'
import { cn } from '@/lib/cn'
import { ReadOnlyNotice } from '@/components/read-only-notice'
import { useCapabilities } from '@/lib/capabilities'
import { Button } from '@/ui/button'
import { Card, FormGrid } from '@/ui/page'

interface GupyDraft {
	gupyApiToken: string
	stepName: string
	sentTagName: string
	sentTagColor: string
	scoreTagPrefix: string
	scoreTagColor: string
}

const EMPTY: GupyDraft = {
	gupyApiToken: '',
	stepName: '',
	sentTagName: 'Coploy enviado',
	sentTagColor: '#CDFB12',
	scoreTagPrefix: 'Nota',
	scoreTagColor: '#2BD9D2',
}

/**
 * Conexão com a Gupy.
 *
 * A ordem dos campos segue a ordem da decisão, não a do banco: primeiro o
 * token (sem ele nada funciona e dá pra testar na hora), depois em QUAL etapa
 * do funil da Gupy a entrevista dispara — que é a única escolha de processo
 * aqui —, e por último a aparência das tags, que é cosmética.
 *
 * O teste de conexão fica junto do token porque token errado é o erro mais
 * comum e o mais caro de descobrir tarde.
 */
export function GupyForm() {
	/* configurar a Gupy é escrita: quem só tem `integration:read` consulta o
	   que está ligado, sem poder trocar token nem desligar a integração */
	const { can } = useCapabilities()
	const editable = can('integration:write')
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = empresa.useGetSettingsIntegrationsGupy()
	const create = empresa.usePostSettingsIntegrationsGupy()
	const update = empresa.usePutSettingsIntegrationsGupyId()
	const remove = empresa.useDeleteSettingsIntegrationsGupyId()
	const test = empresa.usePostSettingsIntegrationsGupyTestConnection()
	const registerWebhooks = empresa.usePostSettingsIntegrationsGupyWebhooksRegister()

	const existing = (
		data?.data as { integrations?: Array<Record<string, unknown>> } | undefined
	)?.integrations?.[0]

	const [draft, setDraft] = useState<GupyDraft>(EMPTY)
	const [hydrated, setHydrated] = useState(false)
	const [saved, setSaved] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
	const [confirmRemoval, setConfirmRemoval] = useState(false)

	useEffect(() => {
		if (hydrated || !existing) return
		setDraft({
			gupyApiToken: String(existing.gupyApiToken ?? ''),
			stepName: String(existing.stepName ?? ''),
			sentTagName: String(existing.sentTagName ?? EMPTY.sentTagName),
			sentTagColor: String(existing.sentTagColor ?? EMPTY.sentTagColor),
			scoreTagPrefix: String(existing.scoreTagPrefix ?? EMPTY.scoreTagPrefix),
			scoreTagColor: String(existing.scoreTagColor ?? EMPTY.scoreTagColor),
		})
		setHydrated(true)
	}, [existing, hydrated])

	const set = <K extends keyof GupyDraft>(key: K, value: GupyDraft[K]) =>
		setDraft((current) => ({ ...current, [key]: value }))

	async function runTest() {
		setTestResult(null)
		try {
			const response = await test.mutateAsync({
				data: { gupyApiToken: draft.gupyApiToken.trim() },
			})
			const body = response.data as { success?: boolean; message?: string }
			setTestResult({ ok: body.success === true, message: body.message ?? '' })
		} catch {
			setTestResult({ ok: false, message: t('integrations.testFailed') })
		}
	}

	async function save() {
		setError(null)
		setSaved(false)
		const payload = {
			gupyApiToken: draft.gupyApiToken.trim(),
			stepName: draft.stepName.trim() || null,
			sentTagName: draft.sentTagName.trim() || null,
			sentTagColor: draft.sentTagColor,
			scoreTagPrefix: draft.scoreTagPrefix.trim() || null,
			scoreTagColor: draft.scoreTagColor,
		}
		try {
			if (existing?.id) {
				await update.mutateAsync({ id: String(existing.id), data: payload as never })
			} else {
				await create.mutateAsync({ data: payload as never })
			}
			setSaved(true)
			await queryClient.invalidateQueries()
		} catch {
			setError(t('integrations.saveError'))
		}
	}

	async function registerHooks() {
		setError(null)
		try {
			await registerWebhooks.mutateAsync({
				data: {
					gupyApiToken: draft.gupyApiToken.trim(),
					companyId: String(existing?.companyId ?? ''),
				} as never,
			})
			setSaved(true)
		} catch {
			setError(t('integrations.webhookRegisterError'))
		}
	}

	const busy = create.isPending || update.isPending

	return (
		<Card
			title={t('integrations.gupyName')}
			description={t('integrations.gupyDescription')}
			actions={
				editable && existing?.id ? (
					confirmRemoval ? (
						<span className='inline-flex items-center gap-1.5 text-[12px]'>
							<span className='text-text-2'>{t('integrations.removeConfirm')}</span>
							<button
								onClick={() =>
									void remove
										.mutateAsync({ id: String(existing.id) })
										.then(() => queryClient.invalidateQueries())
										.finally(() => setConfirmRemoval(false))
								}
								className='rounded p-1 text-danger hover:bg-danger-soft'
								aria-label={t('integrations.removeConfirm')}
							>
								<Check size={14} />
							</button>
							<button
								onClick={() => setConfirmRemoval(false)}
								className='text-muted hover:text-text'
							>
								{t('filters.cancel')}
							</button>
						</span>
					) : (
						<button
							onClick={() => setConfirmRemoval(true)}
							aria-label={t('integrations.remove')}
							className='rounded p-1 text-muted transition-colors hover:text-danger'
						>
							<Trash2 size={14} />
						</button>
					)
				) : null
			}
		>
			{isLoading ? (
				<div className='h-24 animate-pulse rounded-lg bg-card-alt' />
			) : (
				<fieldset disabled={!editable} className='flex flex-col gap-4'>
					<ReadOnlyNotice capability='integration:write' />
					<div>
						<Field label={t('integrations.token')} hint={t('integrations.tokenHint')}>
							<div className='flex gap-2'>
								<input
									type='password'
									value={draft.gupyApiToken}
									onChange={(e) => set('gupyApiToken', e.target.value)}
									placeholder='••••••••'
									className='h-9 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
								/>
								<Button
									variant='secondary'
									onClick={() => void runTest()}
									disabled={!draft.gupyApiToken.trim() || test.isPending}
								>
									{test.isPending ? (
										<Loader2 size={13} className='animate-spin' />
									) : (
										<Plug size={13} />
									)}
									{t('integrations.testConnection')}
								</Button>
							</div>
						</Field>

						{testResult && (
							<p
								className={cn(
									'mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]',
									testResult.ok
										? 'border-lime-mid bg-lime-soft text-lime-fg'
										: 'border-border bg-danger-soft text-danger',
								)}
							>
								{testResult.ok ? <Check size={13} /> : <AlertCircle size={13} />}
								{testResult.message}
							</p>
						)}
					</div>

					<Field label={t('integrations.stepName')} hint={t('integrations.stepNameHint')}>
						<input
							value={draft.stepName}
							onChange={(e) => set('stepName', e.target.value)}
							placeholder={t('integrations.stepNamePlaceholder')}
							className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
						/>
					</Field>

					<div>
						<p className='mb-2 text-[12px] font-medium text-text-2'>
							{t('integrations.tagsTitle')}
							<span className='ml-1.5 font-normal text-muted'>{t('integrations.tagsHint')}</span>
						</p>
						<FormGrid columns={2}>
							<Field label={t('integrations.sentTag')}>
								<TagInput
									label={draft.sentTagName}
									color={draft.sentTagColor}
									onLabel={(v) => set('sentTagName', v)}
									onColor={(v) => set('sentTagColor', v)}
								/>
							</Field>
							<Field label={t('integrations.scoreTag')}>
								<TagInput
									label={draft.scoreTagPrefix}
									color={draft.scoreTagColor}
									onLabel={(v) => set('scoreTagPrefix', v)}
									onColor={(v) => set('scoreTagColor', v)}
									suffix=' 8,6'
								/>
							</Field>
						</FormGrid>
					</div>

					{error && <p className='text-[12px] text-danger'>{error}</p>}

					<div className='flex flex-wrap items-center gap-2'>
						<Button onClick={() => void save()} disabled={busy || !draft.gupyApiToken.trim()}>
							{busy ? t('jobConfig.saving') : t('jobConfig.save')}
						</Button>
						{Boolean(existing?.id) && (
							<Button
								variant='secondary'
								onClick={() => void registerHooks()}
								disabled={registerWebhooks.isPending}
							>
								{registerWebhooks.isPending ? (
									<Loader2 size={13} className='animate-spin' />
								) : null}
								{t('integrations.registerWebhooks')}
							</Button>
						)}
						{saved && (
							<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
								<Check size={13} /> {t('jobConfig.saved')}
							</span>
						)}
					</div>
				</fieldset>
			)}
		</Card>
	)
}

/**
 * Rótulo + cor com preview.
 *
 * A tag aparece dentro da Gupy, não aqui — sem o preview o recrutador só
 * descobre que a cor ficou ilegível depois de sujar o funil do cliente.
 */
function TagInput({
	label,
	color,
	onLabel,
	onColor,
	suffix = '',
}: {
	label: string
	color: string
	onLabel: (value: string) => void
	onColor: (value: string) => void
	suffix?: string
}) {
	return (
		<div className='flex items-center gap-2'>
			<input
				value={label}
				onChange={(e) => onLabel(e.target.value)}
				className='h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
			/>
			<input
				type='color'
				value={color}
				onChange={(e) => onColor(e.target.value)}
				className='h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-surface'
			/>
			<span
				className='shrink-0 rounded-md px-2 py-1 text-[11px] font-medium'
				style={{ backgroundColor: color, color: '#1a2005' }}
			>
				{label || '—'}
				{suffix}
			</span>
		</div>
	)
}
