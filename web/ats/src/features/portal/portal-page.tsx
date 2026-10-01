import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'
import { Page } from '@/ui/page'
import { ScreenAside, TwoCol } from '@/ui/screen-aside'
import { PortalSection } from '@/features/settings/portal-section'

/**
 * O portal de vagas ganhou casa.
 *
 * Ele é a cara pública da empresa — banner, cor, texto, redes — e vivia no meio
 * de uma tela que também guardava dados cadastrais, ações por etapa e
 * importação de candidatos. É trabalho de marca, não ajuste que se faz uma vez.
 */
export function PortalPage() {
	const { t } = useTranslation()
	const { data } = empresa.useGetCompanies()
	const company = data?.data.company as { id?: string } | undefined

	return (
		<Page title={t('portal.title')} subtitle={t('portal.subtitle')}>
			<TwoCol aside={<ScreenAside ns='portal' links={[{ key: 'settings', to: '/configuracoes' }, { key: 'forms', to: '/formularios' }]} />}>
				<PortalSection companyId={company?.id} />
			</TwoCol>
		</Page>
	)
}
