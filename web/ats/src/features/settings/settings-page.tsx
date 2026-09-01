import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { Card, Page } from '@/ui/page'

import { ImportSection } from './import-section'

import { CompanySection } from './company-section'
import { PortalSection } from './portal-section'
import { StageActionsSection } from './stage-actions-section'

/**
 * Configurações da empresa.
 *
 * Só o que a empresa de fato controla. Feature flags (`antiGhosting`,
 * `applyLite`) são exibidas como ESTADO, não como toggle: quem liga é a
 * Coploy, e um switch desabilitado sem explicação faria a pessoa achar que
 * está quebrado.
 */
export function SettingsPage() {
	const { t } = useTranslation()
	const { data } = empresa.useGetCompanies()

	// a rota devolve `{ company: {...} }`, não a company na raiz — ler errado
	// deixava todos os campos vazios e as flags como "Inativo" mesmo ligadas
	const company = (data?.data as { company?: Record<string, unknown> } | undefined)?.company
	const flags = (company?.featureFlags ?? {}) as Record<string, boolean>

	return (
		<Page title={t('settings.title')} subtitle={t('settings.subtitle')}>
			<div className='flex flex-col gap-4'>
				<CompanySection company={company} />

				{/* a cara pública da empresa — logo depois da identidade dela */}
				<PortalSection companyId={(company as { id?: string } | undefined)?.id} />

				<StageActionsSection />

				<Card title={t('settings.features')} description={t('settings.featuresHint')}>
					<ul className='grid gap-2 md:grid-cols-2'>
						{(['antiGhosting', 'applyLite'] as const).map((flag) => (
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
								<span
									className={
										flags[flag]
											? 'shrink-0 rounded-md bg-lime px-2 py-0.5 text-[11px] font-medium text-lime-ink'
											: 'shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted'
									}
								>
									{t(flags[flag] ? 'settings.enabled' : 'settings.disabled')}
								</span>
							</li>
						))}
					</ul>
				</Card>

				{/* migração por último: é operação de entrada, feita uma vez */}
				<ImportSection />
			</div>
		</Page>
	)
}
