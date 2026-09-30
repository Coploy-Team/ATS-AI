import type { CSSProperties, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * O portal é white-label: o candidato entra na CASA DA EMPRESA, e a Coploy
 * fica no rodapé. Este módulo é o mecanismo que veste a marca do cliente —
 * banner, logo, cor primária — vindo do `job_portal` que a empresa configura
 * no ATS. Tudo aqui degrada com intenção: empresa sem branding ganha um
 * gradiente derivado da paleta padrão, nunca uma faixa vazia.
 */
export interface Branding {
	companyName: string | null
	logoUrl: string | null
	bannerUrl: string | null
	/** Fatia vertical do banner (0–100) — a empresa escolhe o recorte no ATS. */
	bannerPosition?: number | null
	primaryColor: string | null
	textColor: string | null
}

/**
 * Ink legível sobre a cor da marca, por luminância (YIQ). O `textColor` do
 * config é a escolha da empresa PARA O BANNER; o texto de dentro do botão
 * precisa de contraste garantido mesmo quando a empresa escolheu mal.
 */
function inkFor(hex: string): string {
	const value = hex.replace('#', '')
	if (!/^[0-9a-f]{6}$/i.test(value)) return '#1a2005'
	const r = parseInt(value.slice(0, 2), 16)
	const g = parseInt(value.slice(2, 4), 16)
	const b = parseInt(value.slice(4, 6), 16)
	return (r * 299 + g * 587 + b * 114) / 1000 >= 145 ? '#111318' : '#ffffff'
}

/**
 * Variáveis de marca do wrapper: todo acento do portal (CTA, link, chip,
 * borda de hover) lê `--brand`/`--brand-ink` — trocar a empresa troca o
 * portal inteiro sem nenhum componente saber de onde a cor veio.
 */
export function brandStyle(branding: Branding | null): CSSProperties {
	const brand = branding?.primaryColor || 'var(--lime)'
	const ink = branding?.primaryColor ? inkFor(branding.primaryColor) : 'var(--lime-ink)'
	return { '--brand': brand, '--brand-ink': ink } as CSSProperties
}

/** Largura de conteúdo do portal — uma régua só para todas as páginas. */
export const CONTAINER = 'mx-auto w-full max-w-5xl px-4 sm:px-6'

function BannerSurface({ branding }: { branding: Branding | null }) {
	if (branding?.bannerUrl) {
		return (
			<>
				<img
					src={branding.bannerUrl}
					alt=''
					className='absolute inset-0 h-full w-full object-cover'
					// o recorte é escolha da empresa (arrastar a capa, no ATS)
					style={{ objectPosition: `50% ${branding.bannerPosition ?? 50}%` }}
				/>
				{/* proteção de leitura: o nome da empresa senta sobre a foto */}
				<div className='absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent' />
			</>
		)
	}
	/*
	 * Sem banner o hero é um campo da COR DA MARCA em dois tons — presença
	 * de marca mesmo pra quem só configurou a cor. Sem cor nenhuma, cai na
	 * paleta padrão do produto e ainda parece decisão, não ausência.
	 */
	return (
		<div
			className='absolute inset-0'
			style={{
				background:
					'linear-gradient(120deg, color-mix(in srgb, var(--brand) 88%, black) 0%, var(--brand) 55%, color-mix(in srgb, var(--brand) 70%, white) 100%)',
			}}
		/>
	)
}

/**
 * Hero da página de carreiras: banner FULL-BLEED (borda a borda, como um
 * site da empresa), logo ancorado meio pra fora (o gesto clássico de portal
 * de vagas — o logo pertence às duas camadas) e nome sobre o banner.
 */
export function BrandHero({
	branding,
	subtitle,
}: {
	branding: Branding | null
	subtitle: string
}) {
	/*
	 * `textColor` é a escolha da empresa PARA O HERO DELA — só vale quando ela
	 * personalizou banner ou cor. No fallback (paleta do produto) mandar o
	 * textColor configurado à parte gerava branco sobre lime claro.
	 */
	const customized = Boolean(branding?.bannerUrl || branding?.primaryColor)
	const textColor = branding?.bannerUrl
		? '#ffffff'
		: customized
			? (branding?.textColor ?? undefined)
			: undefined

	return (
		<header>
			<div className='relative h-52 w-full overflow-hidden sm:h-72'>
				<BannerSurface branding={branding} />
			</div>
			<div className={CONTAINER}>
				<div className='flex flex-wrap items-end gap-4'>
					{/*
					 * o logo meio pra fora do banner: pé no hero, pé no conteúdo.
					 * `relative z-10` é obrigatório: o banner é `position:relative`
					 * e elementos posicionados pintam SOBRE estáticos do mesmo
					 * stacking context — sem isto o banner cobria o logo.
					 */}
					<div className='relative z-10 -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-bg bg-surface shadow-[0_4px_16px_rgba(15,16,20,0.16)] sm:-mt-12 sm:h-24 sm:w-24'>
						{branding?.logoUrl ? (
							<img src={branding.logoUrl} alt='' className='h-full w-full object-cover' />
						) : (
							<div
								className='flex h-full w-full items-center justify-center text-[26px] font-semibold'
								style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}
							>
								{(branding?.companyName ?? '?').charAt(0)}
							</div>
						)}
					</div>
					<div className='pb-1'>
						<h1 className='font-display text-[24px] font-semibold leading-tight tracking-tight sm:text-[28px]'>
							{branding?.companyName ?? ''}
						</h1>
						<p className='text-[13px] text-text-2'>{subtitle}</p>
					</div>
				</div>
			</div>
			{/* o nome também vive SOBRE o banner em telas largas — presença de marca */}
			{textColor && <span className='sr-only'>{branding?.companyName}</span>}
		</header>
	)
}

/**
 * Barra superior fixa das páginas internas (vaga, candidatura): caminho de
 * volta pra casa da empresa à esquerda, a ação principal à direita — sempre
 * ao alcance, por mais longa que seja a descrição.
 */
export function BrandTopbar({
	branding,
	companyId,
	action,
}: {
	branding: Branding | null
	companyId: string
	action?: ReactNode
}) {
	const { t } = useTranslation()
	return (
		<div className='sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur'>
			<div className={`${CONTAINER} flex h-14 items-center justify-between gap-3`}>
				<Link
					to='/$companyId'
					params={{ companyId }}
					className='flex min-w-0 items-center gap-2.5 text-[13px] text-text-2 transition-colors hover:text-text'
				>
					<ArrowLeft size={14} className='shrink-0' />
					<span className='relative h-8 w-8 shrink-0 overflow-hidden rounded-lg'>
						{branding?.logoUrl ? (
							<img src={branding.logoUrl} alt='' className='h-full w-full object-cover' />
						) : (
							<span
								className='flex h-full w-full items-center justify-center text-[13px] font-semibold'
								style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}
							>
								{(branding?.companyName ?? '?').charAt(0)}
							</span>
						)}
					</span>
					<span className='hidden truncate sm:block'>
						{t('job.companyPage', { company: branding?.companyName ?? '' })}
					</span>
				</Link>
				{action}
			</div>
		</div>
	)
}

/** CTA na cor da marca — o mesmo botão em todas as páginas do portal. */
export function BrandButton({
	children,
	disabled,
	type = 'button',
	onClick,
	size = 'md',
}: {
	children: ReactNode
	disabled?: boolean
	type?: 'button' | 'submit'
	onClick?: () => void
	size?: 'md' | 'lg'
}) {
	return (
		<button
			type={type}
			disabled={disabled}
			onClick={onClick}
			className={
				'inline-flex w-fit items-center justify-center rounded-lg font-medium transition-[filter] hover:brightness-95 disabled:opacity-60 ' +
				(size === 'lg' ? 'h-11 px-6 text-[14px]' : 'h-10 px-5 text-[13.5px]')
			}
			style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}
		>
			{children}
		</button>
	)
}
