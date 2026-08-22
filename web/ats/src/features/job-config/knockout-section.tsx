import { Check, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

import { Field, Select } from '../job-form/fields'

type QuestionType = 'boolean' | 'single-choice' | 'number'
type Operator =
	| 'equals'
	| 'not_equals'
	| 'greater_than'
	| 'greater_than_or_equal'
	| 'less_than'
	| 'less_than_or_equal'
	| 'in'
	| 'not_in'

interface KnockoutNode {
	id: string
	question: string
	type: QuestionType
	options?: string[] | null
	rule: { operator: Operator; value: unknown }
	onFail: 'knockout' | 'flag'
}

const MAX_NODES = 10

function newId() {
	return `k_${Math.random().toString(36).slice(2, 8)}`
}

/** Cada tipo só aceita operadores que fazem sentido pra ele. */
const OPERATORS: Record<QuestionType, Operator[]> = {
	boolean: ['equals'],
	'single-choice': ['in', 'not_in'],
	number: ['greater_than_or_equal', 'greater_than', 'less_than_or_equal', 'less_than', 'equals'],
}

function defaultNode(type: QuestionType): KnockoutNode {
	if (type === 'number') {
		return {
			id: newId(),
			question: '',
			type,
			rule: { operator: 'greater_than_or_equal', value: 1 },
			onFail: 'knockout',
		}
	}
	if (type === 'single-choice') {
		return {
			id: newId(),
			question: '',
			type,
			options: ['', ''],
			rule: { operator: 'in', value: [] },
			onFail: 'knockout',
		}
	}
	return {
		id: newId(),
		question: '',
		type,
		rule: { operator: 'equals', value: true },
		onFail: 'knockout',
	}
}

/**
 * Screening knockout da vaga.
 *
 * Este editor é o que tira o knockout do limbo: o campo era lido pelo apply
 * leve mas nenhuma superfície escrevia, então o filtro nunca rodava pra
 * ninguém.
 *
 * O teto de 10 perguntas e o texto de ajuda são deliberados — o knockout
 * existe pra não gastar entrevista com quem não atende requisito objetivo
 * ("tem CNH?", "aceita presencial?"), não pra virar prova. Funil longo é a
 * dor nº1 do candidato na nossa própria pesquisa.
 */
export function KnockoutSection({ jobId }: { jobId: string }) {
	const { t } = useTranslation()
	const { data } = empresa.useGetCompaniesJobsJobIdKnockout(jobId, {
		query: { enabled: Boolean(jobId) },
	})
	const save = empresa.usePutCompaniesJobsJobIdKnockout()

	const serverNodes = useMemo(
		() => (data?.data.knockoutTree?.nodes ?? []) as KnockoutNode[],
		[data],
	)
	const [nodes, setNodes] = useState<KnockoutNode[]>(serverNodes)
	const [saved, setSaved] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => setNodes(serverNodes), [serverNodes])

	const dirty = JSON.stringify(nodes) !== JSON.stringify(serverNodes)
	const configured = data?.data.configured === true

	function update(index: number, patch: Partial<KnockoutNode>) {
		setNodes((current) =>
			current.map((node, i) => (i === index ? { ...node, ...patch } : node)),
		)
	}

	/** Trocar o tipo reseta a regra: operador antigo não vale no tipo novo. */
	function changeType(index: number, type: QuestionType) {
		setNodes((current) =>
			current.map((node, i) =>
				i === index ? { ...defaultNode(type), id: node.id, question: node.question } : node,
			),
		)
	}

	async function persist() {
		setError(null)
		setSaved(false)
		try {
			await save.mutateAsync({ jobId, data: { nodes: nodes as never } })
			setSaved(true)
		} catch {
			setError(t('knockout.saveError'))
		}
	}

	return (
		<section className='rounded-xl border border-border bg-card p-4'>
			<header className='mb-3'>
				<h2 className='font-display text-[14px] font-semibold'>{t('knockout.title')}</h2>
				<p className='mt-0.5 text-[12px] text-text-2'>{t('knockout.description')}</p>
			</header>

			{!configured && (
				<p className='mb-3 rounded-lg border border-lime-mid bg-lime-soft px-3 py-2 text-[12px] text-text'>
					{t('knockout.invite')}
				</p>
			)}

			<ul className='flex flex-col gap-3'>
				{nodes.map((node, index) => (
					<li key={node.id} className='rounded-lg border border-border bg-surface p-3'>
						<div className='flex items-start gap-2'>
							<span className='font-num mt-2 w-4 shrink-0 text-[11px] text-muted'>
								{index + 1}
							</span>
							<input
								value={node.question}
								onChange={(e) => update(index, { question: e.target.value })}
								placeholder={t('knockout.questionPlaceholder')}
								className='h-9 flex-1 rounded-lg border border-border bg-card px-2.5 text-[12.5px] text-text'
							/>
							<button
								onClick={() => setNodes(nodes.filter((_, i) => i !== index))}
								aria-label={t('knockout.remove')}
								className='mt-1.5 rounded p-1 text-muted transition-colors hover:text-danger'
							>
								<Trash2 size={13} />
							</button>
						</div>

						<div className='mt-2.5 grid gap-2 pl-6 sm:grid-cols-3'>
							<Field label={t('knockout.type')}>
								<Select
									value={node.type}
									onChange={(v) => changeType(index, v as QuestionType)}
									options={(['boolean', 'single-choice', 'number'] as const).map((value) => ({
										value,
										label: t(`knockout.types.${value}`),
									}))}
								/>
							</Field>

							<Field label={t('knockout.condition')}>
								<Select
									value={node.rule.operator}
									onChange={(v) =>
										update(index, { rule: { ...node.rule, operator: v as Operator } })
									}
									options={OPERATORS[node.type].map((value) => ({
										value,
										label: t(`knockout.operators.${value}`),
									}))}
								/>
							</Field>

							<Field label={t('knockout.expected')}>
								{node.type === 'boolean' ? (
									<Select
										value={String(node.rule.value)}
										onChange={(v) =>
											update(index, { rule: { ...node.rule, value: v === 'true' } })
										}
										options={[
											{ value: 'true', label: t('knockout.yes') },
											{ value: 'false', label: t('knockout.no') },
										]}
									/>
								) : node.type === 'number' ? (
									<input
										type='number'
										value={Number(node.rule.value ?? 0)}
										onChange={(e) =>
											update(index, { rule: { ...node.rule, value: Number(e.target.value) } })
										}
										className='font-num h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] text-text'
									/>
								) : (
									<input
										value={(node.rule.value as string[] | undefined)?.join(', ') ?? ''}
										onChange={(e) =>
											update(index, {
												rule: {
													...node.rule,
													value: e.target.value
														.split(',')
														.map((v) => v.trim())
														.filter(Boolean),
												},
											})
										}
										placeholder={t('knockout.expectedChoices')}
										className='h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[12.5px] text-text'
									/>
								)}
							</Field>
						</div>

						{node.type === 'single-choice' && (
							<div className='mt-2 pl-6'>
								<Field label={t('knockout.options')} hint={t('knockout.optionsHint')}>
									<input
										value={(node.options ?? []).join(', ')}
										onChange={(e) =>
											update(index, {
												options: e.target.value.split(',').map((v) => v.trim()),
											})
										}
										className='h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[12.5px] text-text'
									/>
								</Field>
							</div>
						)}

						{/* reprovar automático é decisão pesada: precisa ser escolha explícita */}
						<div className='mt-2.5 flex flex-wrap gap-1.5 pl-6'>
							{(['knockout', 'flag'] as const).map((mode) => (
								<button
									key={mode}
									onClick={() => update(index, { onFail: mode })}
									className={cn(
										'rounded-lg border px-2.5 py-1 text-[11.5px] transition-colors',
										node.onFail === mode
											? 'border-lime bg-lime-soft text-lime-fg'
											: 'border-border text-text-2 hover:bg-hover',
									)}
								>
									{t(`knockout.onFail.${mode}`)}
								</button>
							))}
						</div>
					</li>
				))}
			</ul>

			{nodes.length === 0 && (
				<p className='rounded-lg border border-border bg-surface px-3 py-6 text-center text-[12px] text-muted'>
					{t('knockout.empty')}
				</p>
			)}

			<div className='mt-3 flex flex-wrap items-center gap-2'>
				<Button
					variant='secondary'
					size='sm'
					disabled={nodes.length >= MAX_NODES}
					onClick={() => setNodes([...nodes, defaultNode('boolean')])}
				>
					<Plus size={12} /> {t('knockout.add')}
				</Button>
				{nodes.length >= MAX_NODES && (
					<span className='text-[11.5px] text-muted'>{t('knockout.maxReached')}</span>
				)}
			</div>

			{error && <p className='mt-2 text-[12px] text-danger'>{error}</p>}

			<div className='mt-4 flex items-center gap-2'>
				<Button
					onClick={() => void persist()}
					disabled={!dirty || save.isPending || nodes.some((n) => n.question.trim().length < 3)}
				>
					{save.isPending ? t('jobConfig.saving') : t('jobConfig.save')}
				</Button>
				{saved && !dirty && (
					<span className='inline-flex items-center gap-1 text-[12px] text-lime-fg'>
						<Check size={13} /> {t('jobConfig.saved')}
					</span>
				)}
			</div>
		</section>
	)
}
