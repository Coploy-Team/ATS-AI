import { Check, Copy, ExternalLink, Globe, Lock, QrCode } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useParams } from '@tanstack/react-router'

import { empresa } from '@coploy/sdk/react'

import { MotorNotice } from '@/components/motor-notice'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card, Page } from '@/ui/page'
import { QrModal } from '@/ui/qr-modal'

/**
 * Divulgação da vaga.
 *
 * O link da entrevista existia no payload da vaga desde sempre e **não era
 * exibido em lugar nenhum** — o recrutador publicava a vaga e não tinha como
 * copiar o endereço para mandar a alguém. A rota `/companies/jobs/:slug` já
 * devolvia `interviewUrl`; faltava a tela.
 *
 * Dois destinos, porque são coisas diferentes: o **link direto**, que se manda
 * para uma pessoa específica, e a **página de carreiras**, que lista tudo o que
 * está público. Vaga não pública some da segunda, e a tela diz isso em vez de
 * entregar um endereço que devolve 404.
 */
function CopyField({
	label,
	value,
	hint,
	jobName,
}: {
	label: string
	value: string
	hint?: string
	/** Presente = o link vira cartaz: aparece o botão de QR Code. */
	jobName?: string
}) {
	const { t } = useTranslation()
	const [copied, setCopied] = useState(false)
	const [qrAberto, setQrAberto] = useState(false)

	async function copy() {
		try {
			await navigator.clipboard.writeText(value)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			/* clipboard bloqueado: o valor está visível e selecionável no campo */
		}
	}

	return (
		<div className='flex flex-col gap-1.5'>
			<span className='text-[12px] font-medium'>{label}</span>
			{hint && <span className='text-[11.5px] text-text-2'>{hint}</span>}
			<div className='flex flex-wrap items-center gap-2'>
				<input
					readOnly
					value={value}
					onFocus={(event) => event.currentTarget.select()}
					className='h-9 min-w-[240px] flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text'
				/>
				<Button variant='secondary' size='sm' onClick={() => void copy()}>
					{copied ? <Check size={13} /> : <Copy size={13} />}
					{copied ? t('share.copied') : t('share.copy')}
				</Button>
				<a
					href={value}
					target='_blank'
					rel='noreferrer'
					className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] text-text-2 transition-colors hover:bg-hover hover:text-text'
				>
					<ExternalLink size={12} /> {t('share.open')}
				</a>
				{/*
				 * QR por LINK, não por vaga: aqui há mais de um endereço e cada um
				 * leva a um lugar diferente. Um botão só, no topo da tela, obrigaria
				 * a escolher qual — e a escolha certa depende de onde o cartaz vai.
				 */}
				{jobName !== undefined && (
					<button
						type='button'
						onClick={() => setQrAberto(true)}
						className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] text-text-2 transition-colors hover:bg-hover hover:text-text'
					>
						<QrCode size={12} /> {t('share.qr')}
					</button>
				)}
			</div>
			{qrAberto && jobName !== undefined && (
				<QrModal
					url={value}
					jobName={jobName}
					linkLabel={label}
					onClose={() => setQrAberto(false)}
				/>
			)}
		</div>
	)
}

export function ShareTab() {
	const [copiadoTexto, setCopiadoTexto] = useState(false)
	const { t } = useTranslation()
	const { jobId } = useParams({ strict: false }) as { jobId: string }
	const { features } = useCapabilities()

	const { data } = empresa.useGetCompaniesJobsSlug(jobId, {
		query: { enabled: Boolean(jobId) },
	})
	const { data: companyData } = empresa.useGetCompanies()

	const job = data?.data as
		| {
				interviewUrl?: string
				public?: boolean
				stopped?: boolean
				jobName?: string
				jobQuestions?: unknown[]
				additionalQuestions?: unknown[]
		  }
		| undefined
	const companyId = companyData?.data.company?.id ?? ''
	const companyName = companyData?.data.company?.companyName ?? ''
	// título impresso no cartaz — nome da vaga quando o link é dela
	const jobName = job?.jobName ?? ''

	const interviewUrl = job?.interviewUrl ?? ''
	const questionCount = job
		? (job.jobQuestions?.length ?? 0) + (job.additionalQuestions?.length ?? 0)
		: null
	// decisão 2 (martelo 2026-08-23): sem pergunta, o link direto de entrevista
	// não é divulgável — a tela oferece o caminho de consertar
	const interviewReady = questionCount !== null && questionCount > 0
	/*
	 * A página de carreiras vive no app de entrevista, e o link se monta a
	 * partir da origem dele — que é a mesma do link da vaga. Derivar em vez de
	 * ter uma env nova evita que os dois apontem para lugares diferentes.
	 */
	const careersOrigin = interviewUrl ? new URL(interviewUrl).origin : ''
	const careersUrl = careersOrigin ? `${careersOrigin}/careers/${companyId}` : ''
	/*
	 * A página da vaga dentro das carreiras é o link que se manda para uma rede
	 * social: mostra descrição e requisitos antes de pedir login, enquanto o link
	 * direto abre na tela de entrar. Só existe enquanto a vaga estiver pública.
	 */
	const jobPageUrl = careersOrigin ? `${careersOrigin}/careers/${companyId}/jobs/${jobId}` : ''
	/*
	 * O link da candidatura faltava aqui.
	 *
	 * É por ele que o candidato passa pelo formulário — e é onde o filtro de
	 * candidatura é perguntado. Sem esse endereço na tela, o recrutador só tinha
	 * o link direto da entrevista, que PULA o formulário: configurava o filtro e
	 * divulgava o link que o ignora.
	 */
	const applyUrl = careersOrigin
		? `${careersOrigin}/careers/${companyId}/jobs/${jobId}/apply`
		: ''

	const isPublic = job?.public === true && job?.stopped !== true

	/*
	 * O texto que acompanha o link. Curto de propósito: quem publica reescreve,
	 * e um parágrafo pronto demais só dá trabalho de apagar.
	 */
	const textoDeDivulgacao = t('share.postText', { job: job?.jobName ?? '' })

	async function copiarTexto() {
		await navigator.clipboard.writeText(`${textoDeDivulgacao}\n${jobPageUrl}`)
		setCopiadoTexto(true)
		setTimeout(() => setCopiadoTexto(false), 2000)
	}

	/*
	 * Sem o Motor, os endereços desta tela mudam de dono: o link direto de
	 * entrevista não existe, e quem serve carreiras + candidatura é o portal
	 * open (`web/careers`, VITE_CAREERS_URL). Com a env presente a vaga tem
	 * link real pra divulgar; sem ela, só o convite ao plugin — nunca link
	 * morto apontando pro placeholder.
	 */
	const portalBase = (import.meta.env.VITE_CAREERS_URL as string | undefined)?.replace(/\/+$/, '')
	if (!features.motor) {
		const portalCareersUrl = portalBase && companyId ? `${portalBase}/${companyId}` : ''
		const portalJobUrl = portalCareersUrl ? `${portalCareersUrl}/vagas/${jobId}` : ''
		return (
			<Page title={t('share.title')} subtitle={t('share.subtitle')}>
				<div className='flex flex-col gap-4'>
					{portalJobUrl && (
						<Card title={t('share.careersTitle')} description={t('share.portalDescription')}>
							<div className='flex flex-col gap-4'>
								<CopyField
									label={t('share.careersLink')}
									value={portalCareersUrl}
									jobName={companyName}
								/>
								{isPublic && (
									<CopyField
										label={t('share.jobPageLink')}
										value={portalJobUrl}
										jobName={jobName}
									/>
								)}
							</div>
							{!isPublic && (
								<p className='mt-3 text-[12px] text-text-2'>{t('share.notListedHint')}</p>
							)}
						</Card>
					)}
					<MotorNotice context='share' />
				</div>
			</Page>
		)
	}

	return (
		<Page title={t('share.title')} subtitle={t('share.subtitle')}>
			<div className='flex flex-col gap-4'>
				<Card
					title={t('share.directTitle')}
					description={t('share.directDescription')}
				>
					{questionCount === 0 ? (
						<div className='rounded-lg border border-amber-300/60 bg-amber-50/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-800 dark:bg-transparent dark:text-amber-400'>
							{t('share.noQuestions')}{' '}
							<a className='font-semibold underline' href={`/vagas/${jobId}/editar`}>
								{t('share.addQuestions')}
							</a>
						</div>
					) : interviewUrl && interviewReady ? (
						<CopyField
							label={t('share.interviewLink')}
							value={interviewUrl}
							jobName={jobName}
						/>
					) : (
						<p className='py-3 text-[12.5px] text-muted'>{t('jobs.loading')}</p>
					)}
				</Card>

				<Card title={t('share.careersTitle')} description={t('share.careersDescription')}>
					<div
						className={cn(
							'mb-3 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]',
							isPublic
								? 'border-lime-mid bg-lime-soft text-lime-fg'
								: 'border-border text-text-2',
						)}
					>
						{isPublic ? <Globe size={12} /> : <Lock size={12} />}
						{t(isPublic ? 'share.listed' : 'share.notListed')}
					</div>

					{careersUrl && (
						<div className='flex flex-col gap-4'>
							<CopyField label={t('share.careersLink')} value={careersUrl} jobName={companyName} />
							{isPublic && (
								<CopyField label={t('share.jobPageLink')} value={jobPageUrl} jobName={jobName} />
							)}
							{isPublic && (
								<CopyField label={t('share.applyLink')} value={applyUrl} jobName={jobName} />
							)}
						</div>
					)}

					{/* dizer o porquê é o que evita o recrutador achar que o link quebrou */}
					{!isPublic && (
						<p className='mt-3 text-[12px] text-text-2'>{t('share.notListedHint')}</p>
					)}
				</Card>

				{/*
				 * DIVULGAR nas redes.
				 *
				 * A tela dava os endereços e parava aí: quem queria publicar a vaga
				 * copiava o link, abria o LinkedIn, colava e escrevia o texto à mão,
				 * toda vez. Cada rede tem um endereço de compartilhamento que aceita
				 * o link e o texto prontos — é o que o recrutador faz manualmente,
				 * em um clique.
				 *
				 * O alvo é a página PÚBLICA da vaga quando ela existe; o link direto
				 * da entrevista é para uma pessoa específica e não deve ir para uma
				 * rede social.
				 */}
				{isPublic && jobPageUrl && (
					<Card title={t('share.spreadTitle')} description={t('share.spreadDescription')}>
						<div className='flex flex-wrap gap-2'>
							{REDES.map((rede) => (
								<a
									key={rede.id}
									href={rede.montar(jobPageUrl, textoDeDivulgacao)}
									target='_blank'
									rel='noopener noreferrer'
									className='inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] transition-colors hover:border-lime-mid hover:text-lime-fg'
								>
									{rede.rotulo}
								</a>
							))}
							<button
								type='button'
								onClick={() => void copiarTexto()}
								className='inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] transition-colors hover:border-lime-mid hover:text-lime-fg'
							>
								{copiadoTexto ? <Check size={13} /> : <Copy size={13} />}
								{t('share.copyPost')}
							</button>
						</div>
					</Card>
				)}
			</div>
		</Page>
	)
}

/**
 * Para onde a vaga vai.
 *
 * Cada rede recebe o endereço da PÁGINA da vaga e um texto pronto. Não há SDK
 * nem token no meio: são URLs públicas de compartilhamento, então nada quebra
 * quando a rede muda de API.
 */
const REDES = [
	{
		id: 'linkedin',
		rotulo: 'LinkedIn',
		montar: (url: string) =>
			`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
	},
	{
		id: 'whatsapp',
		rotulo: 'WhatsApp',
		montar: (url: string, texto: string) =>
			`https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`,
	},
	{
		id: 'telegram',
		rotulo: 'Telegram',
		montar: (url: string, texto: string) =>
			`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto)}`,
	},
	{
		id: 'x',
		rotulo: 'X',
		montar: (url: string, texto: string) =>
			`https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(texto)}`,
	},
	{
		id: 'facebook',
		rotulo: 'Facebook',
		montar: (url: string) =>
			`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
	},
	{
		id: 'email',
		rotulo: 'E-mail',
		montar: (url: string, texto: string) =>
			`mailto:?subject=${encodeURIComponent(texto)}&body=${encodeURIComponent(url)}`,
	},
] as const
