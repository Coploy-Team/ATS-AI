import { BookOpen, Check, ChevronDown, Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Card, Page } from '@/ui/page'

import { ApiDocs, GupyDocs, WebhookDocs } from './docs'
import { WebhooksSection } from './webhooks-section'

/**
 * Integrações.
 *
 * Duas colunas porque as decisões são independentes: a Gupy é um fluxo de
 * configuração longo (token, etapa, tags), os webhooks são uma lista que
 * cresce. Empilhar as duas faria a segunda sumir abaixo da dobra.
 */
export function IntegrationsPage() {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const { data: companyData } = empresa.useGetCompanies({
		query: { enabled: features.integrations },
	})
	const apiKey = (companyData?.data as { company?: { apiKey?: string } } | undefined)?.company
		?.apiKey

	/*
	 * Edição open: a aba nem aparece no menu, mas link direto cai aqui — e as
	 * rotas de Gupy nem existem no core aberto. Quem tem o código integra por
	 * fora (decisão de produto, 2026-08-22); dizer isso vale mais que um 404.
	 */
	if (!features.integrations) {
		return (
			<Page title={t('integrations.title')} subtitle={t('integrations.subtitle')}>
				<Card>
					<p className='py-6 text-center text-[13px] leading-relaxed text-text-2'>
						{t('integrations.notInThisEdition')}
					</p>
				</Card>
			</Page>
		)
	}

	return (
		<Page title={t('integrations.title')} subtitle={t('integrations.subtitle')}>
			{/* configurar e ENTENDER andam juntos: no v1 a documentação vivia numa
			    aba separada e quem preenchia o token não sabia por que nada
			    disparava. Aqui cada integração traz o próprio manual abaixo do
			    formulário, recolhido pra não competir com a ação. */}
			<div className='grid items-start gap-4 xl:grid-cols-2'>
				<div className='flex flex-col gap-4'>
					
					<Collapsible title={t('integrations.docs.gupyTitle')}>
						<GupyDocs />
					</Collapsible>
				</div>

				<div className='flex flex-col gap-4'>
					<WebhooksSection />
					<Collapsible title={t('integrations.docs.webhookTitle')}>
						<WebhookDocs />
					</Collapsible>
					<ApiKeyCard apiKey={apiKey} />
					<Collapsible title={t('integrations.docs.apiTitle')}>
						<ApiDocs apiKey={apiKey} />
					</Collapsible>
				</div>
			</div>
		</Page>
	)
}

/**
 * Chave de API da empresa.
 *
 * Fica escondida por padrão: é credencial, e deixá-la à mostra numa tela que
 * se compartilha em call é como vazar senha em apresentação.
 */
function ApiKeyCard({ apiKey }: { apiKey?: string }) {
	const { t } = useTranslation()
	const [revealed, setRevealed] = useState(false)
	const [copied, setCopied] = useState(false)

	if (!apiKey) return null

	return (
		<Card title={t('integrations.apiKeyTitle')} description={t('integrations.apiKeyHint')}>
			<div className='flex items-center gap-2'>
				<code className='font-num min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-2.5 py-2 text-[12px] text-text-2'>
					{revealed ? apiKey : '•'.repeat(32)}
				</code>
				<button
					onClick={() => setRevealed((v) => !v)}
					aria-label={t(revealed ? 'integrations.hide' : 'integrations.reveal')}
					className='rounded-lg border border-border p-2 text-muted transition-colors hover:text-text'
				>
					{revealed ? <EyeOff size={14} /> : <Eye size={14} />}
				</button>
				<button
					onClick={() => {
						void navigator.clipboard.writeText(apiKey)
						setCopied(true)
						setTimeout(() => setCopied(false), 1800)
					}}
					aria-label={t('integrations.copy')}
					className='rounded-lg border border-border p-2 text-muted transition-colors hover:text-text'
				>
					{copied ? <Check size={14} className='text-lime-fg' /> : <Copy size={14} />}
				</button>
			</div>
		</Card>
	)
}

/**
 * Documentação recolhida.
 *
 * Aberta por padrão ela empurra a configuração pra baixo da dobra; escondida
 * demais (numa aba) ninguém acha — foi o que aconteceu no v1. Recolhida ao
 * lado do formulário é o meio-termo: visível, sem competir.
 */
function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
	const [open, setOpen] = useState(false)

	return (
		<section className='rounded-xl border border-border bg-card'>
			<button
				onClick={() => setOpen((v) => !v)}
				className='flex w-full items-center justify-between gap-2 px-4 py-3 text-left'
			>
				<span className='inline-flex items-center gap-2 text-[13px] font-medium'>
					<BookOpen size={14} className='text-muted' />
					{title}
				</span>
				<ChevronDown
					size={14}
					className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
				/>
			</button>
			{open && <div className='border-t border-border-soft p-4'>{children}</div>}
		</section>
	)
}
