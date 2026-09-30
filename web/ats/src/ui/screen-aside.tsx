import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card } from '@/ui/page'

/**
 * A coluna lateral que explica a tela (o desenho do Processo seletivo, agora
 * compartilhado): para que serve, onde o que se configura aqui aparece, e o
 * que faz parte do mesmo assunto. Uma tela de configuração sem isso é um
 * formulário solto — a pessoa preenche sem saber o que muda onde.
 *
 * Os textos vivem no i18n em `<ns>.aside.{purpose, where[], links.<k>}`.
 */
export function TwoCol({ children, aside }: { children: ReactNode; aside: ReactNode }) {
	return (
		<div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
			<div className='flex min-w-0 flex-col gap-4'>{children}</div>
			<div className='flex flex-col gap-4 xl:sticky xl:top-0 xl:self-start'>{aside}</div>
		</div>
	)
}

export function ScreenAside({
	ns,
	links = [],
	extra,
}: {
	ns: string
	links?: Array<{ key: string; to: string }>
	/** Cartão extra no topo (estado vivo da tela, prévia) */
	extra?: ReactNode
}) {
	const { t } = useTranslation()
	const where = t(`${ns}.aside.where`, { returnObjects: true, defaultValue: [] }) as unknown
	const lista = Array.isArray(where) ? (where as string[]) : []
	return (
		<>
			{extra}
			<Card title={t(`${ns}.aside.purposeTitle`, { defaultValue: t('aside.purposeTitle') })}>
				<p className='text-[13.5px] leading-relaxed text-text-2'>{t(`${ns}.aside.purpose`)}</p>
				{lista.length > 0 && (
					<>
						<p className='mt-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>{t('aside.whereTitle')}</p>
						<ul className='mt-2 flex flex-col gap-1.5'>
							{lista.map((item) => (
								<li key={item} className='flex gap-2.5 text-[13px] text-text-2'>
									<span className='mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-lime' />
									<span>{item}</span>
								</li>
							))}
						</ul>
					</>
				)}
			</Card>
			{links.length > 0 && (
				<Card title={t('aside.linksTitle')}>
					<div className='flex flex-col gap-2'>
						{links.map((l) => (
							<Link
								key={l.key}
								to={l.to as never}
								className='flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-lime-mid'
							>
								<span className='min-w-0 flex-1'>
									<span className='block text-[13px] font-medium'>{t(`${ns}.aside.links.${l.key}.label`)}</span>
									<span className='block text-[12px] text-muted'>{t(`${ns}.aside.links.${l.key}.hint`)}</span>
								</span>
								<ArrowRight size={13} className='shrink-0 text-muted' />
							</Link>
						))}
					</div>
				</Card>
			)}
		</>
	)
}
