import { Link, useParams } from '@tanstack/react-router'
import { ArrowRight, BadgeCheck, Briefcase, Clock, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { publico } from '@coploy/sdk/react'

import { BrandHero, CONTAINER, brandStyle } from '@/components/brand'
import { Markdown, VideoEmbed } from '@/components/markdown'

/**
 * Página de carreiras da empresa — o endereço que a vaga divulga.
 *
 * O candidato está entrando na casa da EMPRESA: banner, logo e cor vêm do
 * `job_portal` que ela configura no ATS, e a nossa marca fica no rodapé.
 * Referência de mercado: portal Gupy, onde cada cliente tem a própria cara.
 */
export function CareersPage() {
	const { t } = useTranslation()
	const { companyId } = useParams({ strict: false }) as { companyId: string }

	const { data, isLoading, isError } = publico.useGetCareersCompanyIdJobs(companyId, {})

	if (isLoading) {
		return (
			<div className='flex flex-col gap-3'>
				<div className='h-52 w-full animate-pulse bg-card-alt sm:h-72' />
				<div className={`${CONTAINER} flex flex-col gap-3`}>
					<div className='h-24 animate-pulse rounded-xl bg-card-alt' />
					<div className='h-24 animate-pulse rounded-xl bg-card-alt' />
				</div>
			</div>
		)
	}

	const payload = data && data.status === 200 ? data.data : null

	if (isError || !payload) {
		return (
			<div className='py-24 text-center'>
				<p className='text-[15px] font-medium'>{t('careers.notFound')}</p>
				<p className='mt-1 text-[13px] text-text-2'>{t('careers.notFoundHint')}</p>
			</div>
		)
	}

	const { branding, jobs } = payload

	return (
		<div style={brandStyle(branding)} className='pb-14'>
			<BrandHero branding={branding} subtitle={t('careers.openJobs', { count: jobs.length })} />

			<div className={`${CONTAINER} mt-8 flex flex-col gap-3`}>
			{jobs.length === 0 && (
				<div className='rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center'>
					<Briefcase size={20} className='mx-auto mb-2 text-muted' />
					<p className='text-[13.5px] font-medium'>{t('careers.empty')}</p>
					<p className='mt-1 text-[12.5px] text-text-2'>{t('careers.emptyHint')}</p>
				</div>
			)}

			{/*
			 * GRID de cards, não lista de linhas (que é o desenho da Gupy): cada
			 * vaga é um cartão com respiro próprio. A assinatura é o fio da cor
			 * da marca no topo do card, que acende no hover.
			 */}
			<ul className='grid gap-3 sm:grid-cols-2'>
				{jobs.map((job) => (
					<li key={job.jobId}>
						<Link
							to='/$companyId/vagas/$jobId'
							params={{ companyId, jobId: job.jobId }}
							className='group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-12px_rgba(15,16,20,0.25)]'
						>
							<span
								className='h-1 w-full opacity-40 transition-opacity group-hover:opacity-100'
								style={{ background: 'var(--brand)' }}
							/>
							<div className='flex flex-1 flex-col p-4 sm:p-5'>
								<div className='flex flex-wrap items-center gap-2'>
									<h2 className='text-[15.5px] font-semibold leading-snug'>{job.title}</h2>
									{job.verified && (
										<span
											title={t('careers.verifiedHint')}
											className='inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium'
											style={{
												background: 'color-mix(in srgb, var(--brand) 14%, transparent)',
												color: 'color-mix(in srgb, var(--brand) 60%, var(--text))',
											}}
										>
											<BadgeCheck size={11} /> {t('careers.verified')}
										</span>
									)}
								</div>
								<div className='mt-2.5 flex flex-wrap items-center gap-1.5'>
									{job.location && (
										<span className='inline-flex items-center gap-1 rounded-md border border-border-soft bg-surface px-2 py-0.5 text-[11.5px] text-text-2'>
											<MapPin size={10.5} /> {job.location}
										</span>
									)}
									{job.level && (
										<span className='rounded-md border border-border-soft bg-surface px-2 py-0.5 text-[11.5px] text-text-2'>
											{job.level}
										</span>
									)}
									{job.workModality && (
										<span className='rounded-md border border-border-soft bg-surface px-2 py-0.5 text-[11.5px] text-text-2'>
											{job.workModality}
										</span>
									)}
									{job.employmentType && (
										<span className='rounded-md border border-border-soft bg-surface px-2 py-0.5 text-[11.5px] text-text-2'>
											{job.employmentType}
										</span>
									)}
								</div>
								{job.salary && (
									<p
										className='mt-2.5 text-[12.5px] font-semibold'
										style={{ color: 'color-mix(in srgb, var(--brand) 60%, var(--text))' }}
									>
										{job.salary}
									</p>
								)}
								{/* rodapé do card: contexto à esquerda, convite à direita */}
								<div className='mt-auto flex items-center justify-between pt-4'>
									{job.postedAt ? (
										<span className='inline-flex items-center gap-1 text-[11px] text-muted'>
											<Clock size={10} />
											{new Date(job.postedAt).toLocaleDateString()}
										</span>
									) : (
										<span />
									)}
									<span
										className='inline-flex items-center gap-1 text-[12.5px] font-medium'
										style={{ color: 'color-mix(in srgb, var(--brand) 60%, var(--text))' }}
									>
										{t('careers.apply')}
										<ArrowRight
											size={13}
											className='transition-transform group-hover:translate-x-0.5'
										/>
									</span>
								</div>
							</div>
						</Link>
					</li>
				))}
			</ul>
			{/* a empresa se apresenta na home: quem chegou pelo link da empresa
			    (não de uma vaga) decide aqui se rola a lista */}
			{(branding.about || branding.videoUrl) && (
				<section className='mx-auto mt-10 w-full max-w-3xl'>
					<h2
						className='text-[12px] font-semibold uppercase tracking-[0.08em]'
						style={{ color: 'color-mix(in srgb, var(--brand) 55%, var(--text))' }}
					>
						{t('careers.aboutCompany')}
					</h2>
					{branding.about && <Markdown text={branding.about} />}
					<VideoEmbed url={branding.videoUrl ?? null} />
				</section>
			)}
			</div>
		</div>
	)
}
