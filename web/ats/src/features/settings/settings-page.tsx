import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { Card, Page } from '@/ui/page'
import { ScreenAside, TwoCol } from '@/ui/screen-aside'

import { CompanySection } from './company-section'

/** As opções que a empresa liga em si mesma, na ordem em que fazem sentido. */
const FLAGS = ['antiGhosting', 'applyLite', 'jobRequisition'] as const

/**
 * Configurações da empresa.
 *
 * A tela juntava quatro assuntos sem relação — dados da empresa, portal de
 * vagas, ações por etapa e importação de candidatos — porque não havia onde
 * pôr cada um. Agora cada um tem casa, e aqui ficou o que é a EMPRESA: quem
 * ela é e como ela escolheu operar.
 */
export function SettingsPage() {
	const { t } = useTranslation()
	const { data } = empresa.useGetCompanies()
	const { can } = useCapabilities()
	const queryClient = useQueryClient()
	const salvarFlags = empresa.usePutCompaniesFeatureFlags()
	const [salvando, setSalvando] = useState<string | null>(null)
	const [erro, setErro] = useState(false)

	// a rota devolve `{ company: {...} }`, não a company na raiz — ler errado
	// deixava todos os campos vazios e as flags como "Inativo" mesmo ligadas
	const company = (data?.data as { company?: Record<string, unknown> } | undefined)?.company
	const flagsDoServidor = (company?.featureFlags ?? {}) as Record<string, boolean>
	/*
	 * O que o PUT devolveu vence o que a lista tinha: o refetch de `/companies`
	 * pode chegar depois (ou vir de cache), e a tela mostrava "Inativo" com a
	 * flag já ligada no banco — o Henrique ligou "exigir pedido" sem perceber
	 * e a criação de vaga passou a ser recusada.
	 */
	const [flagsLocais, setFlagsLocais] = useState<Record<string, boolean> | null>(null)
	const flags = flagsLocais ?? flagsDoServidor

	async function alternar(flag: string) {
		setErro(false)
		setSalvando(flag)
		try {
			const res = await salvarFlags.mutateAsync({ data: { [flag]: !flags[flag] } as never })
			const devolvido = (res?.data as { featureFlags?: Record<string, boolean> } | undefined)?.featureFlags
			if (devolvido) setFlagsLocais(devolvido)
			await queryClient.invalidateQueries()
		} catch {
			setErro(true)
		} finally {
			setSalvando(null)
		}
	}

	return (
		<Page title={t('settings.title')} subtitle={t('settings.subtitle')}>
			<TwoCol aside={<ScreenAside ns='settings' links={[{ key: 'portal', to: '/portal-de-vagas' }, { key: 'emails', to: '/comunicacao' }, { key: 'process', to: '/processo-seletivo' }]} />}>
				<div className='flex flex-col gap-4'>
					<CompanySection company={company} />

					<Card title={t('settings.features')} description={t('settings.featuresHint')}>
						<ul className='grid gap-2 md:grid-cols-2'>
							{FLAGS.map((flag) => (
								<li
									key={flag}
									className='flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5'
								>
									<div className='min-w-0'>
										<p className='text-[12.5px] font-medium'>{t(`settings.flags.${flag}.label`)}</p>
										<p className='text-[11.5px] leading-snug text-text-2'>
											{t(`settings.flags.${flag}.hint`)}
										</p>
									</div>
									{/*
									 * Era um SELO: dizia ligado/desligado e não deixava mexer —
									 * só o console interno da Coploy escrevia. Com a aprovação de
									 * vagas entrando aqui isso deixou de servir: quem decide se a
									 * empresa exige pedido é quem contrata. E na instalação
									 * aberta não existe console para pedir.
									 */}
									<button
										type='button'
										role='switch'
										aria-checked={flags[flag] === true}
										disabled={!can('settings:write') || salvando !== null}
										onClick={() => void alternar(flag)}
										className='flex shrink-0 items-center gap-2 disabled:opacity-50'
									>
										<span className='font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted'>
											{t(flags[flag] ? 'settings.enabled' : 'settings.disabled')}
										</span>
										{/* interruptor de verdade: selo com texto parecia informação, não controle */}
										<span className={flags[flag] ? 'relative h-5 w-9 rounded-full bg-lime transition-colors' : 'relative h-5 w-9 rounded-full bg-hover transition-colors'}>
											<span className={flags[flag] ? 'absolute top-0.5 left-[18px] h-4 w-4 rounded-full bg-lime-ink transition-[left]' : 'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-text-2 transition-[left]'} />
										</span>
									</button>
								</li>
							))}
						</ul>
						{erro && <p className='mt-2 text-[12px] text-danger'>{t('jobConfig.saveError')}</p>}
					</Card>
				</div>
			</TwoCol>
		</Page>
	)
}
