import { Check, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Card } from '@/ui/page'

/**
 * O que cada papel pode — vindo do SERVIDOR.
 *
 * A tela de Time oferecia três papéis e não dizia o que nenhum deles faz: quem
 * convida escolhia no escuro, e quem já estava no time não tinha como conferir.
 *
 * A matriz desce de `/companies/capabilities`, a mesma fonte que o guard usa
 * para decidir. Escrever a lista aqui à mão a faria mentir na primeira
 * capability nova — e uma tabela de permissão que mente é pior que nenhuma.
 */

/*
 * ⚠️ A chave de tradução troca `:` por `_`.
 *
 * O i18next usa dois-pontos como separador de NAMESPACE: pedir
 * `team.capabilities.job:write` faz ele procurar a chave `write` no namespace
 * `team.capabilities.job`, não achar, e devolver o próprio "write" — foi o que
 * apareceu na tela, uma coluna de "write / delete / move" sem sentido nenhum.
 */

/** Só as capabilities que dizem algo a quem não é desenvolvedor. */
const MOSTRAR = [
	'job:write',
	'job:delete',
	'candidate:move',
	'candidate:reject',
	'candidate:unlock',
	'talent:read',
	'ai:use',
	'team:write',
	'billing:write',
	'settings:write',
	'integration:write',
] as const

export function RolesCard() {
	const { t } = useTranslation()
	const { data } = empresa.useGetCompaniesCapabilities()
	const matriz = (data?.data as { roles?: Array<{ role: string; capabilities: string[] }> })?.roles

	if (!matriz?.length) return null

	return (
		<Card title={t('team.roles.title')} description={t('team.roles.description')}>
			<div className='overflow-x-auto'>
				<table className='w-full border-collapse text-[12.5px]'>
					<thead>
						<tr className='border-b border-border text-left text-[10px] uppercase tracking-wider text-muted'>
							<th className='py-2 pr-4 font-medium'>{t('team.roles.actionColumn')}</th>
							{matriz.map((item) => (
								<th key={item.role} className='px-3 py-2 text-center font-medium'>
									{t(`team.levels.${item.role}`)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{MOSTRAR.map((capability) => (
							<tr key={capability} className='border-b border-border-soft last:border-0'>
								<td className='py-2 pr-4 text-text-2'>
									{t(`team.capabilities.${capability.replace(':', '_')}`)}
								</td>
								{matriz.map((item) => {
									const pode = item.capabilities.includes(capability)
									return (
										<td key={item.role} className='px-3 py-2 text-center'>
											{/*
											 * Ícone E cor: quem não distingue verde de cinza precisa
											 * da forma para ler a tabela.
											 */}
											{pode ? (
												<Check size={14} className='mx-auto text-lime-fg' />
											) : (
												<Minus size={14} className={cn('mx-auto text-muted')} />
											)}
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	)
}
