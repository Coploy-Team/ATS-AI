import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Loader2, Plus, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { Field, Select } from '@/features/job-form/fields'
import { cn } from '@/lib/cn'
import { ReadOnlyNotice } from '@/components/read-only-notice'
import { useCapabilities } from '@/lib/capabilities'
import { Button } from '@/ui/button'
import { Card, FormGrid } from '@/ui/page'

type Method = 'POST' | 'PUT' | 'PATCH'

interface WebhookDraft {
	name: string
	url: string
	method: Method
	approvalThreshold: string
	onlyOnApproval: boolean
	/** Eventos de funil assinados. Vazio = só o resultado da entrevista. */
	events: string[]
}

const EMPTY: WebhookDraft = {
	name: '',
	url: '',
	method: 'POST',
	approvalThreshold: '7',
	onlyOnApproval: false,
	events: [],
}

/**
 * Webhooks de resultado.
 *
 * O "testar" antes de salvar existe porque webhook quebrado só aparece
 * quando uma entrevista termina — e aí o resultado já se perdeu. Testar
 * dispara um payload de exemplo pro endpoint informado, então o erro
 * aparece no momento de configurar, não em produção.
 */
export function WebhooksSection() {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = empresa.useGetSettingsIntegrationsWebhooks()
	const create = empresa.usePostSettingsIntegrationsWebhooks()
	const remove = empresa.useDeleteSettingsIntegrationsWebhooksId()
	const test = empresa.usePostSettingsIntegrationsWebhooksTest()
	const catalog = empresa.useGetSettingsIntegrationsWebhooksEvents()

	const eventTypes =
		(catalog.data?.data as { events?: Array<{ type: string }> } | undefined)?.events ?? []

	const webhooks =
		(data?.data as { webhooks?: Array<Record<string, unknown>> } | undefined)?.webhooks ?? []

	const [adding, setAdding] = useState(false)
	/*
	 * Ler o log de entrega é `integration:read` e continua liberado; criar,
	 * testar e remover webhook é `integration:write`. Desabilitar o cartão
	 * inteiro tiraria do editor justamente o que ele precisa pra investigar
	 * uma entrega que falhou.
	 */
	const { can } = useCapabilities()
	const editable = can('integration:write')
	const [draft, setDraft] = useState<WebhookDraft>(EMPTY)
	const [error, setError] = useState<string | null>(null)
	const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
	const [confirming, setConfirming] = useState<string | null>(null)

	const set = <K extends keyof WebhookDraft>(key: K, value: WebhookDraft[K]) =>
		setDraft((current) => ({ ...current, [key]: value }))

	async function runTest() {
		setTestResult(null)
		try {
			const response = await test.mutateAsync({
				data: { url: draft.url.trim(), method: draft.method } as never,
			})
			const body = response.data as { success?: boolean; message?: string; statusCode?: number }
			setTestResult({
				ok: body.success === true,
				message: body.statusCode ? `${body.statusCode} — ${body.message ?? ''}` : (body.message ?? ''),
			})
		} catch {
			setTestResult({ ok: false, message: t('integrations.testFailed') })
		}
	}

	async function save() {
		setError(null)
		try {
			await create.mutateAsync({
				data: {
					name: draft.name.trim(),
					url: draft.url.trim(),
					method: draft.method,
					approvalThreshold: Number(draft.approvalThreshold),
					onlyOnApproval: draft.onlyOnApproval,
					// lista vazia vira null: assinar é opt-in, e `[]` no banco
					// mentiria dizendo "assinou nada" em vez de "não assinou"
					events: draft.events.length > 0 ? draft.events : null,
				} as never,
			})
			setDraft(EMPTY)
			setAdding(false)
			setTestResult(null)
			await queryClient.invalidateQueries()
		} catch {
			setError(t('integrations.saveError'))
		}
	}

	return (
		<Card
			title={t('integrations.webhooksName')}
			description={t('integrations.webhooksDescription')}
			actions={
				!adding &&
				editable && (
					<Button variant='secondary' size='sm' onClick={() => setAdding(true)}>
						<Plus size={12} /> {t('integrations.addWebhook')}
					</Button>
				)
			}
		>
			<ReadOnlyNotice capability='integration:write' />

			{adding && (
				<div className='mb-4 rounded-lg border border-border bg-surface p-3'>
					<FormGrid columns={2}>
						<Field label={t('integrations.webhookName')}>
							<input
								value={draft.name}
								onChange={(e) => set('name', e.target.value)}
								placeholder='ERP interno'
								className='h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] text-text'
							/>
						</Field>
						<Field label={t('integrations.webhookUrl')}>
							<input
								value={draft.url}
								onChange={(e) => set('url', e.target.value)}
								placeholder='https://'
								className='h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] text-text'
							/>
						</Field>
						<Field label={t('integrations.method')}>
							<Select
								value={draft.method}
								onChange={(v) => set('method', v as Method)}
								options={(['POST', 'PUT', 'PATCH'] as const).map((value) => ({
									value,
									label: value,
								}))}
							/>
						</Field>
						<Field
							label={t('integrations.threshold')}
							hint={t('integrations.thresholdHint')}
						>
							<input
								type='number'
								min={0}
								max={10}
								step={0.5}
								value={draft.approvalThreshold}
								onChange={(e) => set('approvalThreshold', e.target.value)}
								className='font-num h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] text-text'
							/>
						</Field>
					</FormGrid>

					<label className='mt-3 flex w-fit cursor-pointer items-center gap-2.5 text-[12.5px]'>
						<input
							type='checkbox'
							checked={draft.onlyOnApproval}
							onChange={(e) => set('onlyOnApproval', e.target.checked)}
							className='h-3.5 w-3.5 accent-[var(--lime)]'
						/>
						{t('integrations.onlyOnApproval')}
					</label>

					{/*
					 * Assinatura de evento (V2-504).
					 *
					 * Deixado depois do bloco de resultado de propósito: o webhook
					 * de resultado continua sendo o caso comum, e quem quer espelhar
					 * o funil inteiro é minoria — mas era exatamente essa minoria
					 * que não tinha caminho nenhum.
					 */}
					{eventTypes.length > 0 && (
						<div className='mt-3 border-t border-border-soft pt-3'>
							<p className='text-[12px] font-medium'>{t('integrations.eventsTitle')}</p>
							<p className='mt-0.5 text-[11.5px] text-muted'>{t('integrations.eventsHint')}</p>
							<div className='mt-2 flex flex-wrap gap-1.5'>
								{eventTypes.map(({ type }) => {
									const on = draft.events.includes(type)
									return (
										<button
											key={type}
											type='button'
											aria-pressed={on}
											onClick={() =>
												set(
													'events',
													on
														? draft.events.filter((item) => item !== type)
														: [...draft.events, type],
												)
											}
											className={cn(
												'rounded-lg border px-2 py-1 font-mono text-[11px] transition-colors',
												on
													? 'border-lime bg-lime-soft text-lime-fg'
													: 'border-border text-text-2 hover:bg-hover',
											)}
										>
											{type}
										</button>
									)
								})}
							</div>
						</div>
					)}

					{testResult && (
						<p
							className={cn(
								'mt-3 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]',
								testResult.ok
									? 'border-lime-mid bg-lime-soft text-lime-fg'
									: 'border-border bg-danger-soft text-danger',
							)}
						>
							{testResult.ok ? <Check size={13} /> : <AlertCircle size={13} />}
							{testResult.message}
						</p>
					)}

					{error && <p className='mt-2 text-[12px] text-danger'>{error}</p>}

					<div className='mt-3 flex flex-wrap items-center gap-2'>
						<Button
							onClick={() => void save()}
							disabled={create.isPending || !draft.name.trim() || !draft.url.startsWith('http')}
						>
							{create.isPending ? t('jobConfig.saving') : t('jobConfig.save')}
						</Button>
						{/* testar ANTES de salvar: webhook quebrado só aparece quando uma
						    entrevista termina, e aí o resultado já se perdeu */}
						<Button
							variant='secondary'
							onClick={() => void runTest()}
							disabled={!draft.url.startsWith('http') || test.isPending}
						>
							{test.isPending ? <Loader2 size={13} className='animate-spin' /> : <Send size={13} />}
							{t('integrations.testWebhook')}
						</Button>
						<Button
							variant='secondary'
							onClick={() => {
								setAdding(false)
								setDraft(EMPTY)
								setTestResult(null)
							}}
						>
							{t('filters.cancel')}
						</Button>
					</div>
				</div>
			)}

			{isLoading && <div className='h-16 animate-pulse rounded-lg bg-card-alt' />}

			{!isLoading && webhooks.length === 0 && !adding && (
				<p className='py-6 text-center text-[12px] text-muted'>{t('integrations.noWebhooks')}</p>
			)}

			{webhooks.length > 0 && (
				<ul className='flex flex-col divide-y divide-border-soft'>
					{webhooks.map((hook) => {
						const id = String(hook.id)
						return (
							<li key={id} className='flex items-center gap-3 py-2.5'>
								<span
									className={cn(
										'h-1.5 w-1.5 shrink-0 rounded-full',
										hook.enabled === false ? 'bg-data-track' : 'bg-lime',
									)}
								/>
								<span className='min-w-0 flex-1'>
									<span className='block truncate text-[12.5px] font-medium'>
										{String(hook.name ?? '—')}
									</span>
									<span className='block truncate text-[11px] text-muted'>
										{String(hook.method ?? 'POST')} {String(hook.url ?? '')}
									</span>
								</span>
								{Array.isArray(hook.events) && hook.events.length > 0 && (
									<span className='font-num shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-2'>
										{t('integrations.eventsCount', { count: hook.events.length })}
									</span>
								)}
								{typeof hook.approvalThreshold === 'number' && (
									<span className='font-num shrink-0 text-[11.5px] text-text-2'>
										≥ {hook.approvalThreshold}
									</span>
								)}
								{confirming === id ? (
									<span className='inline-flex shrink-0 items-center gap-1.5 text-[11.5px]'>
										<button
											onClick={() =>
												void remove
													.mutateAsync({ id })
													.then(() => queryClient.invalidateQueries())
													.finally(() => setConfirming(null))
											}
											className='rounded p-1 text-danger hover:bg-danger-soft'
											aria-label={t('integrations.removeConfirm')}
										>
											<Check size={13} />
										</button>
										<button
											onClick={() => setConfirming(null)}
											className='text-muted hover:text-text'
										>
											{t('filters.cancel')}
										</button>
									</span>
								) : (
									editable && (
									<button
										onClick={() => setConfirming(id)}
										aria-label={t('integrations.remove')}
										className='shrink-0 rounded p-1 text-muted transition-colors hover:text-danger'
									>
										<Trash2 size={13} />
									</button>
									)
								)}
							</li>
						)
					})}
				</ul>
			)}
		</Card>
	)
}
