import { ListPlus, Plus, Trash2, X , ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { orgUnitTree } from '@/lib/org-tree'

import { empresa } from '@coploy/sdk/react'

import { ReadOnlyNotice } from '@/components/read-only-notice'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { stagger } from '@/lib/motion'
import { Button } from '@/ui/button'
import { ConfirmDialog } from '@/ui/confirm-dialog'
import { Card, Page } from '@/ui/page'
import { ScreenAside, TwoCol } from '@/ui/screen-aside'
import { SkeletonCard } from '@/ui/skeleton'

/**
 * Estrutura da empresa: unidades e campos próprios.
 *
 * ## Por que uma tela e não mais uma seção em Configurações
 *
 * Configurações já acumulava dados da empresa, e-mails, recursos e importação.
 * Empilhar mais duas seções ali transformaria a tela num depósito de tudo que
 * não coube em outro lugar — que é como uma tela de configuração vira aquela
 * que ninguém consegue explicar. Estrutura é um assunto próprio: define como a
 * empresa se organiza, e é consultada quando se abre vaga, não quando se mexe
 * em preferência.
 *
 * ## O que essas duas coisas resolvem
 *
 * **Unidades** — vaga não pertence só à empresa: pertence a uma área, um
 * departamento, um centro de custo. Sem isso não existe relatório por área nem
 * orçamento por CC, e o diretor não consegue ver "as vagas da minha área".
 *
 * **Campos próprios** — toda empresa tem um dado que só ela tem: matrícula,
 * turno, número da requisição no SAP. Sem onde guardá-lo, ou o cliente não
 * migra, ou enfia tudo na descrição da vaga.
 *
 * Os dois já existiam como CRUD no core e **nada os consumia** — a vaga não
 * apontava para unidade nem guardava valor de campo. Esta leva ligou as duas
 * pontas; sem isso, esta tela seria um cadastro decorativo.
 */
type UnitKind = 'area' | 'department' | 'cost_center' | 'unit'
type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean'
type Entity = 'job' | 'candidate'

interface Unit {
	id: string
	kind: UnitKind
	name: string
	/** Código no ERP do cliente — é por ele que o import CSV casa. */
	externalCode?: string | null
	active?: boolean
}

interface Field {
	id: string
	entity: Entity
	key: string
	label: string
	type: FieldType
	options?: string[] | null
	required?: boolean
}

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'boolean']

export function StructurePage() {
	const { t } = useTranslation()
	const { can } = useCapabilities()
	const editable = can('settings:write')

	return (
		<Page title={t('structure.title')} subtitle={t('structure.subtitle')}>
			<TwoCol aside={<ScreenAside ns='structure' links={[{ key: 'forms', to: '/formularios' }, { key: 'analytics', to: '/analytics' }]} />}>
				<div className='mb-4'>
					<ReadOnlyNotice capability='settings:write' />
				</div>
				<UnitsCard editable={editable} />
			</TwoCol>
		</Page>
	)
}

/**
 * Campos próprios saíram de Estrutura.
 *
 * Estavam juntos por acaso de arquivo: unidade organizacional é o organograma
 * da empresa, campo próprio é o que o formulário da vaga pergunta. Quem procura
 * "onde eu adiciono uma pergunta na vaga" nunca ia procurar em "Estrutura".
 */
export function FormsPage() {
	const { t } = useTranslation()
	const { can } = useCapabilities()
	const editable = can('settings:write')
	const { data: fieldsData } = empresa.useGetCompaniesCustomFields()
	const fields = ((fieldsData?.data as { fields?: Array<{ id: string; label: string; type: string; active?: boolean; options?: string[] }> } | undefined)?.fields ?? []).filter(
		(f) => f.active !== false,
	)
	/*
	 * A tela conta o FORMULÁRIO inteiro, não só o que se acrescenta a ele:
	 * quem chega aqui quer saber "o que a vaga pergunta e onde entra o meu
	 * campo". O mapa dos passos responde isso antes de qualquer cadastro.
	 */
	const passos = ['basics', 'description', 'competencies', 'questions', 'review'] as const

	return (
		<Page title={t('forms.title')} subtitle={t('forms.subtitle')}>
			<div className='mb-4'>
				<ReadOnlyNotice capability='settings:write' />
			</div>
			<div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]'>
				<div className='flex min-w-0 flex-col gap-4'>
					<Card title={t('forms.mapTitle')} description={t('forms.mapHint')}>
						<ol className='grid gap-3 md:grid-cols-2'>
							{passos.map((passo, i) => (
								<li key={passo} style={stagger(i)} className='rise flex gap-3 rounded-[10px] border border-border bg-bg px-3.5 py-3'>
									<span className='font-mono text-[11px] text-lime-fg'>{String(i + 1).padStart(2, '0')}</span>
									<div className='min-w-0'>
										<p className='text-[13.5px] font-semibold'>{t(`jobForm.step.${passo}`)}</p>
										<p className='mt-0.5 text-[12.5px] leading-snug text-text-2'>{t(`forms.map.${passo}`)}</p>
										{passo === 'basics' && (
											<p className='mt-1.5 flex flex-wrap gap-1.5'>
												<span className='rounded-full bg-lime-soft px-2 py-px text-[11px] font-semibold text-lime-fg'>{t('forms.hereCategories')}</span>
												<span className='rounded-full bg-lime-soft px-2 py-px text-[11px] font-semibold text-lime-fg'>{t('forms.hereFields')}</span>
											</p>
										)}
									</div>
								</li>
							))}
						</ol>
					</Card>
					<CategoriesCard editable={editable} />
					<FieldsCard editable={editable} />
				</div>

				<div className='flex flex-col gap-4 xl:sticky xl:top-0 xl:self-start'>
					{/* como o campo próprio aparece para quem cria a vaga */}
					<Card title={t('forms.previewTitle')} description={t('forms.previewHint')}>
						<div className='flex flex-col gap-3 rounded-[10px] border border-border bg-bg p-3'>
							{(fields.length > 0
								? fields.slice(0, 4)
								: [{ id: 'ex', label: t('forms.previewExample'), type: 'select', options: ['Manhã', 'Tarde', 'Noite'] }]
							).map((f) => (
								<label key={f.id} className='flex flex-col gap-1'>
									<span className='font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted'>{f.label}</span>
									<span className='flex h-8 items-center rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-muted'>
										{f.type === 'select'
											? (f.options?.[0] ?? '—')
											: f.type === 'boolean'
												? t('forms.previewBoolean')
												: f.type === 'date'
													? 'dd/mm/aaaa'
													: f.type === 'number'
														? '0'
														: t('forms.previewText')}
									</span>
								</label>
							))}
						</div>
						{fields.length === 0 && <p className='mt-2 text-[12px] text-muted'>{t('forms.previewEmpty')}</p>}
					</Card>

					<Card title={t('forms.typesTitle')}>
						<ul className='flex flex-col divide-y divide-border-soft'>
							{FIELD_TYPES.map((tipo) => (
								<li key={tipo} className='flex items-baseline justify-between gap-3 py-1.5'>
									<span className='text-[13px] font-medium'>{t(`structure.types.${tipo}`)}</span>
									<span className='text-right text-[12px] text-muted'>{t(`forms.typeExamples.${tipo}`)}</span>
								</li>
							))}
						</ul>
					</Card>

					<Card title={t('forms.relatedTitle')}>
						<div className='flex flex-col gap-2'>
							<Link to='/estrutura' className='flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-lime-mid'>
								<span className='min-w-0 flex-1'>
									<span className='block text-[13px] font-medium'>{t('forms.structureLink')}</span>
									<span className='block text-[12px] text-muted'>{t('forms.structureHint')}</span>
								</span>
								<ArrowRight size={13} className='text-muted' />
							</Link>
							<Link to='/modelos' className='flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-lime-mid'>
								<span className='min-w-0 flex-1'>
									<span className='block text-[13px] font-medium'>{t('forms.templatesLink')}</span>
									<span className='block text-[12px] text-muted'>{t('forms.templatesHint')}</span>
								</span>
								<ArrowRight size={13} className='text-muted' />
							</Link>
						</div>
					</Card>
				</div>
			</div>
		</Page>
	)
}

/**
 * Linha de criação inline. Vive FORA do UnitsCard de propósito: definida
 * dentro, ela ganhava identidade nova a cada render e o React remontava os
 * inputs — o campo de código perdia o foco a cada tecla (bug do teste).
 */
function UnitAddRow({
	depth,
	name,
	code,
	pending,
	onName,
	onCode,
	onSubmit,
	onCancel,
	namePlaceholder,
	codePlaceholder,
	addLabel,
	cancelLabel,
}: {
	depth: number
	name: string
	code: string
	pending: boolean
	onName: (value: string) => void
	onCode: (value: string) => void
	onSubmit: () => void
	onCancel: () => void
	namePlaceholder: string
	codePlaceholder: string
	addLabel: string
	cancelLabel: string
}) {
	const keys = (event: React.KeyboardEvent) => {
		if (event.key === 'Enter') onSubmit()
		if (event.key === 'Escape') onCancel()
	}
	return (
		<div style={{ marginLeft: depth * 18 }} className='flex items-center gap-1.5 py-1'>
			<input
				autoFocus
				value={name}
				onChange={(event) => onName(event.target.value)}
				onKeyDown={keys}
				placeholder={namePlaceholder}
				className='h-8 w-44 rounded-lg border border-lime-mid bg-surface px-2.5 text-[12.5px]'
			/>
			<input
				value={code}
				onChange={(event) => onCode(event.target.value)}
				onKeyDown={keys}
				placeholder={codePlaceholder}
				className='font-num h-8 w-24 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
			/>
			<Button size='sm' onClick={onSubmit} disabled={!name.trim() || pending}>
				{addLabel}
			</Button>
			<button onClick={onCancel} className='text-[12px] text-text-2 hover:text-text'>
				{cancelLabel}
			</button>
		</div>
	)
}

function UnitsCard({ editable }: { editable: boolean }) {
	const { t } = useTranslation()
	const { data, isLoading, refetch } = empresa.useGetCompaniesOrgUnits()
	const create = empresa.usePostCompaniesOrgUnits()
	const setActive = empresa.usePatchCompaniesOrgUnitsId()

	const units = ((data?.data as { units?: Unit[] } | undefined)?.units ?? []) as Unit[]

	const [removing, setRemoving] = useState<Unit | null>(null)
	/*
	 * UMA árvore, sem tipos na tela (decisão de 2026-08-22, no teste da open):
	 * "São Paulo → Tecnologia → TI" é como a empresa pensa — quatro seções por
	 * tipo obrigavam quatro árvores paralelas e confundiam. O `kind` continua
	 * no dado por compat; a hierarquia agora é livre no servidor também.
	 *
	 * Criar é inline: o "+" de um nó cria um FILHO dele; "Nova unidade" cria
	 * uma raiz. O pai vem do lugar do clique — nenhum select.
	 */
	const [adding, setAdding] = useState<{ parentId: string | null } | null>(null)
	const [name, setName] = useState('')
	const [code, setCode] = useState('')

	/** Remover é desativar: a vaga antiga continua sabendo de que área era. */
	async function remove(id: string) {
		await setActive.mutateAsync({ id, data: { active: false } })
		await refetch()
		setRemoving(null)
	}

	async function submit() {
		if (!adding || !name.trim()) return
		await create.mutateAsync({
			data: {
				kind: 'unit',
				name: name.trim(),
				externalCode: code.trim() || null,
				parentId: adding.parentId,
			},
		})
		await refetch()
		setName('')
		setCode('')
		setAdding(null)
	}

	const startAdding = (parentId: string | null) => {
		setName('')
		setCode('')
		setAdding({ parentId })
	}

	const addRowProps = {
		name,
		code,
		pending: create.isPending,
		onName: setName,
		onCode: setCode,
		onSubmit: () => void submit(),
		onCancel: () => setAdding(null),
		namePlaceholder: t('structure.unitName'),
		codePlaceholder: t('structure.unitCode'),
		addLabel: t('structure.add'),
		cancelLabel: t('structure.cancel'),
	}

	return (
		<Card title={t('structure.unitsTitle')} description={t('structure.unitsHint')}>
			{isLoading && <SkeletonCard lines={3} />}

			{!isLoading && units.length === 0 && !adding && (
				<p className='py-4 text-center text-[12.5px] text-muted'>{t('structure.unitsEmpty')}</p>
			)}

			<div className='flex flex-col'>
				{orgUnitTree(units).map(({ unit, depth }) => (
					<div key={unit.id}>
						<div
							style={{ marginLeft: depth * 18 }}
							className='group flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] transition-colors hover:bg-hover'
						>
							{depth > 0 && <span className='text-muted'>&#8250;</span>}
							<span>{unit.name}</span>
							{unit.externalCode && (
								<span className='font-num text-[10.5px] text-muted'>{unit.externalCode}</span>
							)}
							{editable && (
								<span className='flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'>
									<button
										onClick={() => startAdding(unit.id)}
										title={t('structure.addChild', { name: unit.name })}
										className='rounded p-0.5 text-muted hover:text-lime-fg'
									>
										<Plus size={12} />
									</button>
									<button
										onClick={() => setRemoving(unit)}
										aria-label={t('structure.removeUnit', { name: unit.name })}
										className='rounded p-0.5 text-muted hover:text-danger'
									>
										<X size={11} />
									</button>
								</span>
							)}
						</div>
						{adding?.parentId === unit.id && <UnitAddRow depth={depth + 1} {...addRowProps} />}
					</div>
				))}
			</div>

			{adding?.parentId === null && <UnitAddRow depth={0} {...addRowProps} />}

			{editable && !adding && (
				<button
					onClick={() => startAdding(null)}
					className='mt-2 inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-[12px] text-text-2 transition-colors hover:border-lime-mid hover:text-lime-fg'
				>
					<Plus size={11} /> {t('structure.newUnit')}
				</button>
			)}

			{removing && (
				<ConfirmDialog
					title={t('structure.removeUnitTitle', { name: removing.name })}
					description={t('structure.removeUnitConsequence')}
					confirmLabel={t('structure.removeConfirm')}
					tone='danger'
					pending={setActive.isPending}
					onConfirm={() => void remove(removing.id)}
					onCancel={() => setRemoving(null)}
				/>
			)}
		</Card>
	)
}

function FieldsCard({ editable }: { editable: boolean }) {
	const { t } = useTranslation()
	const { data, isLoading, refetch } = empresa.useGetCompaniesCustomFields()
	const create = empresa.usePostCompaniesCustomFields()
	const setActive = empresa.usePatchCompaniesCustomFieldsId()

	const fields = ((data?.data as { fields?: Field[] } | undefined)?.fields ?? []) as Field[]

	const [open, setOpen] = useState(false)
	const [removing, setRemoving] = useState<Field | null>(null)
	const [entity, setEntity] = useState<Entity>('job')
	const [label, setLabel] = useState('')
	const [type, setType] = useState<FieldType>('text')
	const [options, setOptions] = useState('')

	/** Mesmo raciocínio das unidades: some da tela, o dado já gravado continua. */
	async function remove(id: string) {
		await setActive.mutateAsync({ id, data: { active: false } })
		await refetch()
		setRemoving(null)
	}

	async function submit() {
		await create.mutateAsync({
			data: {
				entity,
				label: label.trim(),
				type,
				// só o tipo `select` usa opções; mandar lista vazia nos outros polui o dado
				options:
					type === 'select'
						? options
								.split(',')
								.map((option) => option.trim())
								.filter(Boolean)
						: null,
				required: false,
			},
		})
		await refetch()
		setLabel('')
		setOptions('')
		setOpen(false)
	}

	return (
		<Card title={t('structure.fieldsTitle')} description={t('structure.fieldsHint')}>
			{isLoading && <SkeletonCard lines={3} />}

			{!isLoading && fields.length === 0 && (
				<p className='py-6 text-center text-[12.5px] text-muted'>{t('structure.fieldsEmpty')}</p>
			)}

			{fields.map((field) => (
				<div
					key={field.id}
					className='flex flex-wrap items-center gap-2 border-b border-border-soft py-2 last:border-0'
				>
					<span className='min-w-0 flex-1'>
						<span className='block truncate text-[12.5px] font-medium'>{field.label}</span>
						{/* a `key` é o que vai para a API e para o export — precisa ficar à vista */}
						<span className='font-num block truncate text-[10.5px] text-muted'>{field.key}</span>
					</span>
					<span className='rounded-full bg-card-alt px-2 py-0.5 text-[11px] text-text-2'>
						{t(`structure.types.${field.type}`)}
					</span>
					<span
						className={cn(
							'rounded-full px-2 py-0.5 text-[11px]',
							field.entity === 'job' ? 'bg-lime-soft text-lime-fg' : 'bg-card-alt text-text-2',
						)}
					>
						{t(`structure.entities.${field.entity}`)}
					</span>
					{editable && (
						<button
							onClick={() => setRemoving(field)}
							aria-label={t('structure.removeField', { name: field.label })}
							className='rounded p-1 text-muted transition-colors hover:text-danger'
						>
							<X size={12} />
						</button>
					)}
				</div>
			))}

			{removing && (
				<ConfirmDialog
					title={t('structure.removeFieldTitle', { name: removing.label })}
					description={t('structure.removeFieldConsequence')}
					confirmLabel={t('structure.removeConfirm')}
					tone='danger'
					pending={setActive.isPending}
					onConfirm={() => void remove(removing.id)}
					onCancel={() => setRemoving(null)}
				/>
			)}

			{editable && (
				<div className='mt-3 border-t border-border-soft pt-3'>
					{open ? (
						<div className='flex flex-col gap-2'>
							<div className='grid gap-2 sm:grid-cols-3'>
								<select
									value={entity}
									onChange={(event) => setEntity(event.target.value as Entity)}
									className='h-9 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								>
									<option value='job'>{t('structure.entities.job')}</option>
									<option value='candidate'>{t('structure.entities.candidate')}</option>
								</select>
								<input
									value={label}
									onChange={(event) => setLabel(event.target.value)}
									placeholder={t('structure.fieldLabel')}
									className='h-9 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								/>
								<select
									value={type}
									onChange={(event) => setType(event.target.value as FieldType)}
									className='h-9 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								>
									{FIELD_TYPES.map((value) => (
										<option key={value} value={value}>
											{t(`structure.types.${value}`)}
										</option>
									))}
								</select>
							</div>

							{type === 'select' && (
								<input
									value={options}
									onChange={(event) => setOptions(event.target.value)}
									placeholder={t('structure.optionsPlaceholder')}
									className='h-9 rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
								/>
							)}

							<div className='flex gap-2'>
								<Button
									size='sm'
									onClick={() => void submit()}
									disabled={!label.trim() || create.isPending}
								>
									{t('structure.add')}
								</Button>
								<Button variant='secondary' size='sm' onClick={() => setOpen(false)}>
									{t('filters.cancel')}
								</Button>
							</div>
						</div>
					) : (
						<Button variant='secondary' size='sm' onClick={() => setOpen(true)}>
							<ListPlus size={12} /> {t('structure.newField')}
						</Button>
					)}
				</div>
			)}
		</Card>
	)
}


/**
 * As áreas de vaga da empresa.
 *
 * ⚠️ A empresa ACRESCENTA, não substitui. As áreas que servimos a todo mundo são
 * vocabulário compartilhado — é por elas que o hunting e o portal público
 * encontram vaga entre empresas diferentes; deixar um cliente renomear ou apagar
 * uma delas quebraria a busca dos outros e deixaria vaga antiga apontando para um
 * nome que deixou de existir. Por isso a tela mostra as duas listas separadas e
 * só deixa mexer na de baixo.
 */
function CategoriesCard({ editable }: { editable: boolean }) {
	const { t } = useTranslation()
	const { data, refetch } = empresa.useGetCompaniesJobCategories()
	const salvar = empresa.usePutCompaniesJobCategories()

	const payload = data?.data as { base?: string[]; custom?: string[] } | undefined
	const base = payload?.base ?? []
	const custom = payload?.custom ?? []

	const [nova, setNova] = useState('')
	const [erro, setErro] = useState<string | null>(null)

	async function gravar(lista: string[]) {
		setErro(null)
		try {
			await salvar.mutateAsync({ data: { categories: lista } })
			await refetch()
		} catch {
			setErro(t('forms.categoriesError'))
		}
	}

	async function adicionar() {
		const area = nova.trim()
		if (!area) return
		/*
		 * Recusa aqui o que o servidor também recusa — repetida some no PUT sem
		 * dizer por quê, e a pessoa fica clicando achando que a tela travou.
		 */
		const jaExiste = [...base, ...custom].some(
			(c) => c.toLowerCase() === area.toLowerCase(),
		)
		if (jaExiste) {
			setErro(t('forms.categoriesDuplicate', { name: area }))
			return
		}
		setNova('')
		await gravar([...custom, area])
	}

	return (
		<Card title={t('forms.categoriesTitle')} description={t('forms.categoriesHint')}>
			{custom.length === 0 ? (
				<p className='py-2 text-[12.5px] text-muted'>{t('forms.categoriesEmpty')}</p>
			) : (
				<ul className='mb-3 flex flex-wrap gap-1.5'>
					{custom.map((area) => (
						<li
							key={area}
							className='flex items-center gap-1.5 rounded-full bg-lime-soft px-2.5 py-1 text-[12.5px] font-semibold text-lime-fg'
						>
							{area}
							{editable && (
								<button
									onClick={() => void gravar(custom.filter((c) => c !== area))}
									aria-label={t('forms.categoriesRemove', { name: area })}
									className='text-muted transition-colors hover:text-danger'
								>
									<Trash2 size={12} />
								</button>
							)}
						</li>
					))}
				</ul>
			)}

			{editable && (
				<div className='flex flex-wrap items-center gap-2'>
					<input
						value={nova}
						onChange={(e) => setNova(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && void adicionar()}
						placeholder={t('forms.categoriesPlaceholder')}
						maxLength={60}
						className='h-8 flex-1 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text placeholder:text-muted'
					/>
					<Button
						variant='secondary'
						size='sm'
						onClick={() => void adicionar()}
						disabled={!nova.trim() || salvar.isPending}
					>
						<Plus size={12} /> {t('forms.categoriesAdd')}
					</Button>
				</div>
			)}

			{erro && <p className='mt-2 text-[12px] text-danger'>{erro}</p>}

			{/* as áreas da casa ficam VISÍVEIS: "79 prontas" sem mostrar quais não diz nada */}
			<details className='mt-3'>
				<summary className='cursor-pointer text-[12.5px] text-lime-fg'>
					{t('forms.categoriesBaseShow', { count: base.length })}
				</summary>
				<ul className='mt-2 flex flex-wrap gap-1'>
					{base.map((area) => (
						<li key={area} className='rounded-full border border-border-soft px-2 py-px text-[11.5px] text-text-2'>
							{area}
						</li>
					))}
				</ul>
			</details>
		</Card>
	)
}
