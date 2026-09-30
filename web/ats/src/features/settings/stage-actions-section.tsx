import { Check, Mail, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { ReadOnlyNotice } from '@/components/read-only-notice'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card } from '@/ui/page'
import { Skeleton } from '@/ui/skeleton'

const ICONS: Record<string, typeof Mail> = {
	invite_interview: Mail,
	request_resume: FileText,
}

/**
 * O que cada etapa faz sozinha.
 *
 * Até aqui mover o cartão só mudava a cor: "aprovado" era selo. A configuração
 * é uma grade — etapa nas linhas, ação nas colunas — porque a pergunta que se
 * responde aqui é "o que acontece quando alguém chega nesta etapa", e uma lista
 * por ação obrigaria a ler tudo para descobrir o que uma etapa dispara.
 *
 * Sem etapa configurada nada muda: o produto continua exatamente como era.
 */
export function StageActionsSection() {
	const { t } = useTranslation()
	const { can } = useCapabilities()
	const editable = can('settings:write')

	const { data, isLoading, refetch } = empresa.useGetCompaniesStageActions()
	const save = empresa.usePutCompaniesStageActions()

	const payload = data?.data as
		| {
				actions: Record<string, string[]>
				stages: Array<{ id: string; label: string }>
				available: string[]
		  }
		| undefined

	const [draft, setDraft] = useState<Record<string, string[]>>({})
	const [saved, setSaved] = useState(false)

	useEffect(() => {
		if (payload) setDraft(payload.actions)
	}, [payload])

	function toggle(stageId: string, action: string) {
		setSaved(false)
		setDraft((current) => {
			const list = current[stageId] ?? []
			return {
				...current,
				[stageId]: list.includes(action)
					? list.filter((item) => item !== action)
					: [...list, action],
			}
		})
	}

	async function persist() {
		/*
		 * O gerador tipa cada ação como enum. O estado aqui é `string[]` porque
		 * as opções vêm de `payload.available` — do próprio servidor, na mesma
		 * resposta — então o valor só pode ser um dos válidos. O cast é a
		 * fronteira entre um catálogo dinâmico e um enum gerado, não um atalho.
		 */
		await save.mutateAsync({
			data: { actions: draft } as Parameters<typeof save.mutateAsync>[0]['data'],
		})
		await refetch()
		setSaved(true)
	}

	return (
		<Card title={t('stageActions.title')} description={t('stageActions.hint')}>
			<ReadOnlyNotice capability='settings:write' />

			{isLoading || !payload ? (
				<Skeleton className='h-40 w-full' />
			) : (
				<div className='flex flex-col gap-3'>
					<div className='overflow-x-auto'>
						<table className='w-full min-w-[420px] border-collapse text-[13px]'>
							<thead>
								<tr className='border-b border-border-soft text-left'>
									<th className='pb-2 pr-3 font-medium text-muted'>{t('stageActions.stage')}</th>
									{payload.available.map((action) => (
										<th key={action} className='px-3 pb-2 font-medium text-muted'>
											{t(`stageActions.actions.${action}`)}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{payload.stages.map((stage) => (
									<tr key={stage.id} className='border-b border-border-soft last:border-0'>
										<td className='py-2 pr-3 text-text'>{stage.label}</td>
										{payload.available.map((action) => {
											const on = (draft[stage.id] ?? []).includes(action)
											const Icon = ICONS[action] ?? Mail
											return (
												<td key={action} className='px-3 py-2'>
													<button
														onClick={() => toggle(stage.id, action)}
														disabled={!editable}
														aria-pressed={on}
														/* rótulo diz o ESTADO, não a ação: "Desliga" num botão
														   apagado lia como se a etapa estivesse ligada */
														className={cn('inline-flex items-center gap-2', !editable && 'cursor-not-allowed opacity-60')}
													>
														<span className={on ? 'relative h-5 w-9 rounded-full bg-lime transition-colors' : 'relative h-5 w-9 rounded-full bg-hover transition-colors'}>
															<span className={on ? 'absolute top-0.5 left-[18px] h-4 w-4 rounded-full bg-lime-ink transition-[left]' : 'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-text-2 transition-[left]'} />
														</span>
														<span className={cn('inline-flex items-center gap-1 text-[12px]', on ? 'text-lime-fg' : 'text-muted')}>
															<Icon size={12} />
															{on ? t('stageActions.on') : t('stageActions.off')}
														</span>
													</button>
												</td>
											)
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<p className='text-[11.5px] text-muted'>{t('stageActions.footnote')}</p>

					{editable && (
						<div className='flex items-center gap-2'>
							<Button onClick={() => void persist()} disabled={save.isPending}>
								{save.isPending ? t('jobConfig.saving') : t('jobConfig.save')}
							</Button>
							{saved && (
								<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
									<Check size={13} /> {t('jobConfig.saved')}
								</span>
							)}
						</div>
					)}
				</div>
			)}
		</Card>
	)
}
