import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
	Briefcase,
	CalendarDays,
	Check,
	Clock,
	Facebook,
	Globe,
	Instagram,
	Link2,
	Linkedin,
	MapPin,
	Monitor,
	Star,
	TrendingUp,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { publico } from '@coploy/sdk/react'

import { BrandButton, BrandTopbar, CONTAINER, brandStyle } from '@/components/brand'
import { Markdown, VideoEmbed } from '@/components/markdown'

/** Largura de leitura: descrição longa em coluna de texto, não na tela toda. */
const PROSE = 'mx-auto w-full max-w-3xl'

function Section({ title, text, children }: { title: string; text?: string | null; children?: ReactNode }) {
	if (!text && !children) return null
	return (
		<section>
			<h2
				className='text-[12px] font-semibold uppercase tracking-[0.08em]'
				style={{ color: 'color-mix(in srgb, var(--brand) 55%, var(--text))' }}
			>
				{title}
			</h2>
			{/* Markdown, não texto cru: as seções da vaga têm subtítulos, listas e
			    negrito (texto legado sem marcação renderiza idêntico ao que era) */}
			{text && <Markdown text={text} />}
			{children}
		</section>
	)
}

/** Fato da vaga em ícone + texto, na linha — o padrão que o candidato já lê em todo portal. */
function Fact({ icon: Icon, value }: { icon: typeof MapPin; value: string | null }) {
	if (!value) return null
	return (
		<span className='inline-flex items-center gap-1.5 text-[13px] text-text-2'>
			<Icon size={14} className='shrink-0' style={{ color: 'color-mix(in srgb, var(--brand) 55%, var(--text))' }} />
			{value}
		</span>
	)
}

/**
 * A presença da empresa fora do portal, como fecho da página: quem leu até
 * aqui está decidindo se confia — dar onde conferir é parte da candidatura.
 * Só aparecem as redes configuradas; lista vazia = seção não existe.
 */
const SOCIAL_META: Record<string, { icon: typeof Globe; label: string }> = {
	website: { icon: Globe, label: 'Site' },
	linkedin: { icon: Linkedin, label: 'LinkedIn' },
	instagram: { icon: Instagram, label: 'Instagram' },
	facebook: { icon: Facebook, label: 'Facebook' },
	glassdoor: { icon: Star, label: 'Glassdoor' },
}

function SocialLinks({ links }: { links: Array<{ kind: string; url: string }> }) {
	const { t } = useTranslation()
	if (links.length === 0) return null
	return (
		<section>
			<h2
				className='text-[12px] font-semibold uppercase tracking-[0.08em]'
				style={{ color: 'color-mix(in srgb, var(--brand) 55%, var(--text))' }}
			>
				{t('job.connectTitle')}
			</h2>
			<div className='mt-3 flex flex-wrap gap-2'>
				{links.map(({ kind, url }) => {
					const meta = SOCIAL_META[kind] ?? { icon: Globe, label: kind }
					return (
						<a
							key={kind}
							href={url}
							target='_blank'
							rel='noopener noreferrer'
							className='inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] font-medium transition-colors hover:border-[var(--brand)]'
						>
							<meta.icon
								size={13}
								style={{ color: 'color-mix(in srgb, var(--brand) 60%, var(--text))' }}
							/>
							{meta.label}
						</a>
					)
				})}
			</div>
		</section>
	)
}

/** Copiar o endereço da vaga — divulgação começa aqui. */
function CopyLinkButton() {
	const { t } = useTranslation()
	const [copied, setCopied] = useState(false)
	async function copy() {
		try {
			await navigator.clipboard.writeText(window.location.href)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			/* clipboard bloqueado: a URL está na barra do navegador */
		}
	}
	return (
		<button
			type='button'
			onClick={() => void copy()}
			className='inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-[13px] font-medium transition-colors'
			style={{
				borderColor: 'color-mix(in srgb, var(--brand) 45%, var(--border))',
				color: 'color-mix(in srgb, var(--brand) 60%, var(--text))',
			}}
		>
			{copied ? <Check size={13} /> : <Link2 size={13} />}
			{copied ? t('job.copied') : t('job.copyLink')}
		</button>
	)
}

/**
 * Etapas do processo — a régua REAL da vaga (kanban-config), a mesma que o
 * recrutador move no board. É informação de sequência de verdade, então os
 * marcadores numerados aqui carregam significado, não decoração.
 */
function ProcessSteps({
	stages,
}: {
	stages: Array<{ id: string; order: number; label: string }>
}) {
	const { t } = useTranslation()
	if (stages.length === 0) return null
	return (
		<section>
			<h2
				className='text-[12px] font-semibold uppercase tracking-[0.08em]'
				style={{ color: 'color-mix(in srgb, var(--brand) 55%, var(--text))' }}
			>
				{t('job.processTitle')}
			</h2>
			<ol className='mt-3 flex flex-col gap-0 sm:flex-row sm:gap-2'>
				{stages.map((stage, index) => (
					<li key={stage.id} className='flex flex-1 items-start gap-2.5 sm:flex-col sm:gap-2'>
						<div className='flex flex-col items-center sm:w-full sm:flex-row sm:gap-2'>
							<span
								className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold'
								style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}
							>
								{index + 1}
							</span>
							{/* conector: a linha diz "depois vem" — some no último */}
							{index < stages.length - 1 && (
								<span
									className='h-6 w-px sm:h-px sm:flex-1'
									style={{ background: 'color-mix(in srgb, var(--brand) 35%, var(--border))' }}
								/>
							)}
						</div>
						<p className='pb-4 pt-1 text-[12.5px] font-medium leading-snug sm:pb-0 sm:pt-0'>
							{stage.label}
						</p>
					</li>
				))}
			</ol>
		</section>
	)
}

export function JobPage() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { companyId, jobId } = useParams({ strict: false }) as {
		companyId: string
		jobId: string
	}

	const { data, isLoading, isError } = publico.useGetCareersCompanyIdJobsJobId(companyId, jobId)

	if (isLoading) {
		return (
			<div className={`${CONTAINER} py-10`}>
				<div className='h-64 animate-pulse rounded-xl bg-card-alt' />
			</div>
		)
	}

	const payload = data && data.status === 200 ? data.data : null

	if (isError || !payload) {
		return (
			<div className='py-24 text-center'>
				<p className='text-[15px] font-medium'>{t('job.notFound')}</p>
				<p className='mt-1 text-[13px] text-text-2'>{t('job.notFoundHint')}</p>
				<Link
					to='/$companyId'
					params={{ companyId }}
					className='mt-3 inline-block text-[13px] font-medium text-lime-fg hover:underline'
				>
					{t('job.back')}
				</Link>
			</div>
		)
	}

	const { branding, job } = payload
	const closed = job.closingDate !== null && new Date(job.closingDate) < new Date()
	const goApply = () =>
		void navigate({ to: '/$companyId/vagas/$jobId/candidatar', params: { companyId, jobId } })

	const formatDate = (value: string) => new Date(value).toLocaleDateString()

	return (
		<div style={brandStyle(branding)} className='pb-16'>
			<BrandTopbar
				branding={branding}
				companyId={companyId}
				action={closed ? undefined : <BrandButton onClick={goApply}>{t('job.apply')}</BrandButton>}
			/>

			{/* faixa fina de marca: a página da vaga continua na casa da empresa */}
			<div
				className='h-1.5 w-full'
				style={{ background: 'var(--brand)' }}
			/>

			<div className={`${CONTAINER} mt-8`}>
				<div className={PROSE}>
					<header className='flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6'>
						<div className='min-w-0'>
							<h1 className='font-display text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]'>
								{job.title}
							</h1>
							<div className='mt-2 flex flex-col gap-0.5 text-[12.5px] text-text-2'>
								{job.postedAt && <span>{t('job.postedAt', { date: formatDate(job.postedAt) })}</span>}
								{job.closingDate && !closed && (
									<span>{t('job.openUntil', { date: formatDate(job.closingDate) })}</span>
								)}
							</div>
						</div>
						<CopyLinkButton />
					</header>

					<div className='flex flex-wrap gap-x-6 gap-y-2 border-b border-border py-5'>
						<Fact icon={MapPin} value={job.location} />
						<Fact icon={TrendingUp} value={job.level} />
						<Fact icon={Monitor} value={job.workModality} />
						<Fact icon={Briefcase} value={job.contractType ?? job.employmentType} />
						<Fact icon={Clock} value={job.jobHours} />
						{job.salary && (
							<span
								className='inline-flex items-center gap-1.5 text-[13px] font-semibold'
								style={{ color: 'color-mix(in srgb, var(--brand) 60%, var(--text))' }}
							>
								{job.salary}
							</span>
						)}
					</div>

					{closed && (
						<p className='mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-text-2'>
							<CalendarDays size={13} className='mr-1.5 inline' />
							{t('job.closed')}
						</p>
					)}

					<div className='mt-8 flex flex-col gap-8'>
						<Section title={t('job.description')} text={job.description} />
						<Section title={t('job.requirements')} text={job.requirements} />
						<Section title={t('job.responsibilities')} text={job.responsibilities} />
						<Section title={t('job.benefits')} text={job.benefits} />

						<ProcessSteps stages={job.processStages ?? []} />

						{/* "sobre" do portal (escrito pela empresa) vence o companyDescription
						    que o Motor gravou POR VAGA; vídeo entra na mesma seção */}
						{(branding.about || job.companyDescription || branding.videoUrl) && (
							<Section
								title={t('job.aboutCompany')}
								text={branding.about ?? job.companyDescription}
							>
								<VideoEmbed url={branding.videoUrl ?? null} />
							</Section>
						)}

						<SocialLinks links={branding.socialLinks ?? []} />
					</div>

					{!closed && (
						<div className='mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-6'>
							<BrandButton size='lg' onClick={goApply}>
								{t('job.apply')}
							</BrandButton>
							<CopyLinkButton />
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
