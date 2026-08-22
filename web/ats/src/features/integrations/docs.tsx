import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

/**
 * Bloco de código copiável.
 *
 * Documentação de integração existe pra ser colada em outro lugar — sem o
 * botão de copiar, quem lê seleciona à mão e perde a indentação.
 */
export function CodeBlock({ code, language }: { code: string; language?: string }) {
	const [copied, setCopied] = useState(false)

	return (
		<div className='relative'>
			<pre className='max-h-[280px] overflow-auto rounded-lg border border-border bg-surface p-3 text-[11.5px] leading-relaxed'>
				<code className='font-num text-text-2'>{code}</code>
			</pre>
			{language && (
				<span className='absolute right-10 top-2 rounded bg-card px-1.5 py-0.5 text-[10px] text-muted'>
					{language}
				</span>
			)}
			<button
				onClick={() => {
					void navigator.clipboard.writeText(code)
					setCopied(true)
					setTimeout(() => setCopied(false), 1600)
				}}
				aria-label='copy'
				className='absolute right-2 top-2 rounded-md border border-border bg-card p-1.5 text-muted transition-colors hover:text-text'
			>
				{copied ? <Check size={12} className='text-lime-fg' /> : <Copy size={12} />}
			</button>
		</div>
	)
}

/** Passo numerado — "como funciona" só ajuda se a ordem for visível. */
export function Steps({ items }: { items: Array<{ title: string; description: string }> }) {
	return (
		<ol className='flex flex-col gap-3'>
			{items.map((item, index) => (
				<li key={item.title} className='flex gap-3'>
					<span className='font-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime-soft text-[11px] font-semibold text-lime-fg'>
						{index + 1}
					</span>
					<span className='min-w-0'>
						<span className='block text-[12.5px] font-medium'>{item.title}</span>
						<span className='block text-[12px] leading-snug text-text-2'>
							{item.description}
						</span>
					</span>
				</li>
			))}
		</ol>
	)
}

export function DocSection({
	title,
	children,
	className,
}: {
	title: string
	children: React.ReactNode
	className?: string
}) {
	return (
		<div className={cn('border-t border-border-soft pt-4', className)}>
			<h3 className='mb-2.5 text-[11px] font-medium uppercase tracking-wider text-muted'>
				{title}
			</h3>
			{children}
		</div>
	)
}

/** Payload real do webhook — o que o cliente vai receber, não um exemplo genérico. */
export const WEBHOOK_PAYLOAD = `{
  "event": "interview.finished",
  "interviewId": "kM3xPq...",
  "jobId": "desenvolvedor-frontend",
  "companyId": "pEzWH...",
  "candidateName": "Ana Silva",
  "candidateEmail": "ana@example.com",
  "score": 8.6,
  "approved": true,
  "companyFeedback": "Sólida experiência com React e visão de produto.",
  "candidateFeedback": "Você se comunicou com clareza...",
  "interviewUrl": "https://interview.coploy.io/...",
  "finishedAt": "2026-08-16T14:02:11.000Z"
}`

export function apiCurl(apiKey: string | undefined): string {
	const key = apiKey ? `${apiKey.slice(0, 8)}...` : 'ck_sua_chave'
	return `curl -X GET 'https://api.coploy.io/companies/jobs?limit=20' \\
  -H 'x-api-key: ${key}'`
}

/**
 * Documentação da integração Gupy.
 *
 * O v1 tinha isto e o v2 não: sem explicar o fluxo, o recrutador preenche o
 * token e não entende por que nada acontece — a entrevista só dispara quando
 * o candidato ENTRA na etapa configurada, e isso não é óbvio.
 */
export function GupyDocs() {
	const { t } = useTranslation()

	return (
		<div className='flex flex-col gap-4'>
			<DocSection title={t('integrations.docs.howItWorks')} className='border-t-0 pt-0'>
				<Steps
					items={[1, 2, 3, 4].map((n) => ({
						title: t(`integrations.docs.gupyStep${n}Title`),
						description: t(`integrations.docs.gupyStep${n}Desc`),
					}))}
				/>
			</DocSection>

			<DocSection title={t('integrations.docs.requirements')}>
				<ul className='flex flex-col gap-1.5'>
					{[1, 2, 3].map((n) => (
						<li key={n} className='flex items-start gap-2 text-[12px] text-text-2'>
							<span className='mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted' />
							{t(`integrations.docs.gupyReq${n}`)}
						</li>
					))}
				</ul>
			</DocSection>

			<DocSection title={t('integrations.docs.troubleshooting')}>
				<dl className='flex flex-col gap-2.5'>
					{[1, 2, 3].map((n) => (
						<div key={n}>
							<dt className='text-[12px] font-medium'>{t(`integrations.docs.gupyFaq${n}Q`)}</dt>
							<dd className='text-[12px] leading-snug text-text-2'>
								{t(`integrations.docs.gupyFaq${n}A`)}
							</dd>
						</div>
					))}
				</dl>
			</DocSection>
		</div>
	)
}

export function WebhookDocs() {
	const { t } = useTranslation()

	return (
		<div className='flex flex-col gap-4'>
			<DocSection title={t('integrations.docs.payload')} className='border-t-0 pt-0'>
				<p className='mb-2 text-[12px] leading-snug text-text-2'>
					{t('integrations.docs.payloadHint')}
				</p>
				<CodeBlock code={WEBHOOK_PAYLOAD} language='json' />
			</DocSection>

			<DocSection title={t('integrations.docs.retry')}>
				<p className='text-[12px] leading-snug text-text-2'>{t('integrations.docs.retryHint')}</p>
			</DocSection>
		</div>
	)
}

export function ApiDocs({ apiKey }: { apiKey?: string }) {
	const { t } = useTranslation()

	return (
		<div className='flex flex-col gap-4'>
			<DocSection title={t('integrations.docs.auth')} className='border-t-0 pt-0'>
				<p className='mb-2 text-[12px] leading-snug text-text-2'>
					{t('integrations.docs.authHint')}
				</p>
				<CodeBlock code={apiCurl(apiKey)} language='bash' />
			</DocSection>

			<DocSection title={t('integrations.docs.endpoints')}>
				<ul className='flex flex-col divide-y divide-border-soft'>
					{[
						{ method: 'GET', path: '/companies/jobs', desc: t('integrations.docs.epJobs') },
						{
							method: 'GET',
							path: '/companies/jobs/:id/candidates',
							desc: t('integrations.docs.epCandidates'),
						},
						{
							method: 'PATCH',
							path: '/companies/interviews/:id',
							desc: t('integrations.docs.epMove'),
						},
					].map((endpoint) => (
						<li key={endpoint.path} className='flex items-baseline gap-2 py-1.5 text-[12px]'>
							<span className='font-num w-12 shrink-0 text-[10.5px] font-medium text-lime-fg'>
								{endpoint.method}
							</span>
							<code className='font-num min-w-0 flex-1 truncate text-text-2'>
								{endpoint.path}
							</code>
							<span className='hidden shrink-0 text-[11px] text-muted sm:block'>
								{endpoint.desc}
							</span>
						</li>
					))}
				</ul>
				<p className='mt-2.5 text-[11px] text-muted'>{t('integrations.docs.contractHint')}</p>
			</DocSection>
		</div>
	)
}
