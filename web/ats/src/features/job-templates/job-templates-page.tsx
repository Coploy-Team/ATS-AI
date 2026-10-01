import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowRight, FileText, Plus, Trash2 } from 'lucide-react'

import { empresa } from '@coploy/sdk/react'
import { useCapabilities } from '@/lib/capabilities'
import { Card, Page } from '@/ui/page'
import { ScreenAside, TwoCol } from '@/ui/screen-aside'
import { Button } from '@/ui/button'
import { SkeletonCard } from '@/ui/skeleton'

type Modelo = {
	id: string
	name: string
	jobName?: string | null
	description?: string | null
	createdByName?: string | null
	carrerLevel?: string | null
	jobCategories?: string | null
	jobDescription?: string | null
	jobRequirements?: string | null
	jobQuestions?: unknown[] | null
	kanbanConfig?: unknown
	knockoutTree?: unknown
}

/**
 * Os recortes do acervo.
 *
 * ⚠️ Não são quatro TIPOS de modelo — são quatro ângulos do mesmo registro. O
 * `JobTemplate` carrega descrição, etapas e perguntas juntos porque foi salvo de
 * uma vaga inteira; quem entra por "Descrições" quer ver quais modelos trazem
 * texto pronto, e não um catálogo separado que alguém teria que manter em dia.
 */
export type RecorteDeModelo = 'todos' | 'descricoes' | 'processos' | 'roteiros'

const TEM_CONTEUDO: Record<RecorteDeModelo, (m: Modelo) => boolean> = {
	todos: () => true,
	descricoes: (m) => Boolean(m.jobDescription?.trim() || m.jobRequirements?.trim()),
	processos: (m) => Boolean(m.kanbanConfig),
	roteiros: (m) => (m.jobQuestions?.length ?? 0) > 0,
}

/**
 * O acervo de modelos.
 *
 * Não há formulário de cadastro em branco aqui de propósito: modelo nasce de
 * uma vaga que alguém já escreveu ("salvar como modelo", dentro da vaga).
 * Catálogo que exige escrever antes de precisar nasce vazio e morre vazio.
 */
export function JobTemplatesPage({
	recorte = 'todos',
}: {
	recorte?: RecorteDeModelo
} = {}) {
	const { t } = useTranslation()
	const { can } = useCapabilities()
	const [removendo, setRemovendo] = useState<string | null>(null)

	const { data, isLoading, refetch } = empresa.useGetCompaniesJobTemplates()
	const todos = ((data?.data as { templates?: Modelo[] } | undefined)?.templates ??
		[]) as Modelo[]
	const modelos = todos.filter(TEM_CONTEUDO[recorte])

	const apagar = empresa.useDeleteCompaniesJobTemplatesId()
	const podeGerir = can('settings:write')

	async function remover(id: string) {
		setRemovendo(null)
		await apagar.mutateAsync({ id })
		await refetch()
	}

	return (
		<Page title={t(`templates.${recorte}Title`)} subtitle={t(`templates.${recorte}Subtitle`)}>
			<TwoCol aside={<ScreenAside ns='templates' links={[{ key: 'jobs', to: '/vagas' }, { key: 'forms', to: '/formularios' }]} />}>
				{isLoading ? (
					<SkeletonCard lines={3} />
				) : modelos.length === 0 ? (
					<Card title={recorte !== 'todos' ? t(`templates.${recorte}Title`) : t('templates.emptyTitle')}>
						<p className='mb-3 text-[13px] text-text-2'>
							{recorte !== 'todos' ? t(`templates.${recorte}EmptyBody`) : t('templates.emptyBody')}
						</p>
						<Link to='/vagas'>
							<Button variant='secondary'>
								{t('templates.emptyAction')} <ArrowRight size={13} />
							</Button>
						</Link>
					</Card>
				) : (
					<div className='flex flex-col gap-3'>
						{modelos.map((m) => (
							<Card key={m.id} title={m.name}>
								<div className='flex flex-wrap items-start justify-between gap-3'>
									<div className='min-w-0 flex-1'>
										{m.jobName && (
											<p className='text-[13px]'>
												<span className='text-muted'>{t('templates.suggests')} </span>
												{m.jobName}
											</p>
										)}
										<p className='mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted'>
											{m.carrerLevel && <span>{m.carrerLevel}</span>}
											{m.jobCategories && <span>{m.jobCategories}</span>}
											{/* o que o modelo traz além do texto — é o que o distingue de copiar e colar */}
											{Array.isArray(m.jobQuestions) && m.jobQuestions.length > 0 && (
												<span>
													{t('templates.withQuestions', { count: m.jobQuestions.length })}
												</span>
											)}
											{m.kanbanConfig != null && <span>{t('templates.withStages')}</span>}
											{m.knockoutTree != null && <span>{t('templates.withKnockout')}</span>}
										</p>
										{m.createdByName && (
											<p className='mt-1 text-[11.5px] text-muted'>
												{t('templates.by', { name: m.createdByName })}
											</p>
										)}
									</div>

									<div className='flex shrink-0 items-center gap-2'>
										<Link to='/vagas/nova' search={{ modelo: m.id }}>
											<Button variant='secondary'>
												<FileText size={13} /> {t('templates.use')}
											</Button>
										</Link>
										{podeGerir &&
											(removendo === m.id ? (
												<>
													<Button
														variant='danger'
														onClick={() => void remover(m.id)}
														disabled={apagar.isPending}
													>
														{t('templates.confirmRemove')}
													</Button>
													<Button variant='ghost' onClick={() => setRemovendo(null)}>
														{t('filters.cancel')}
													</Button>
												</>
											) : (
												<Button variant='ghost' onClick={() => setRemovendo(m.id)}>
													<Trash2 size={13} />
												</Button>
											))}
									</div>
								</div>
							</Card>
						))}
					</div>
				)}

				{modelos.length > 0 && (
					<p className='mt-4 flex items-center gap-1.5 text-[12.5px] text-muted'>
						<Plus size={13} />
						{t('templates.howToAdd')}
					</p>
				)}
			</TwoCol>
		</Page>
	)
}
