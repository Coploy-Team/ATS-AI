import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useCapabilities } from '@/lib/capabilities'

/**
 * Diz por que os controles de edição não estão aqui.
 *
 * `RequireCapability` esconde a ação, que é o certo para um botão solto. Numa
 * TELA inteira o silêncio vira outro problema: o editor abre Configuração, vê
 * os campos, não acha o Salvar e conclui que a tela está quebrada — ou pior,
 * digita tudo antes de descobrir. Some o controle E se explica.
 *
 * Só aparece para quem não tem a capability; para os demais não ocupa espaço.
 */
export function ReadOnlyNotice({ capability }: { capability: string }) {
	const { can, role, isLoading } = useCapabilities()
	const { t } = useTranslation()

	if (isLoading || can(capability)) return null

	return (
		<div className='flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5 text-[13px] text-text-2'>
			<Lock size={14} className='mt-0.5 shrink-0 text-muted' />
			<p>
				{t('rbac.readOnly', {
					role: t(`rbac.role.${role}`, { defaultValue: role }),
				})}
			</p>
		</div>
	)
}
