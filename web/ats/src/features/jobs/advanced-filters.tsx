import { SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CATEGORIES, HUNTING_LEVELS } from '@/features/job-form/job-options'
import { SearchableSelect } from '@/features/job-form/searchable-select'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

/**
 * Filtros que não cabem nas pills principais. No dashboard antigo isso era um
 * modal que tampava a lista; aqui é um popover ancorado ao botão — a lista
 * continua visível enquanto se filtra, e o que está ativo vira chip removível
 * ao lado (o modal escondia o estado do filtro).
 */
export interface AdvancedValues {
	language: string
	segment: string
	level: string
	country: string
	state: string
	city: string
}

export const EMPTY_ADVANCED: AdvancedValues = {
	language: 'all',
	segment: 'all',
	level: 'all',
	country: '',
	state: '',
	city: '',
}

/*
 * As opções vêm das listas canônicas (`job-form/job-options.ts`), as mesmas do
 * formulário. Eram três listas escritas à mão aqui, menores que o formulário: a
 * vaga de "Coordenador" ou de "Agronegócio" existia e não havia como filtrar
 * por ela.
 */
const SEGMENTS = CATEGORIES
const LEVELS = HUNTING_LEVELS
const LANGUAGES = ['pt', 'en', 'es', 'fr', 'it']

export function countActive(values: AdvancedValues): number {
	return Object.entries(values).filter(([k, v]) => v !== EMPTY_ADVANCED[k as keyof AdvancedValues])
		.length
}

function Field({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<label className='flex flex-col gap-1 text-[11px] font-medium text-text-2'>
			{label}
			{children}
		</label>
	)
}

const inputCls =
	'h-8 rounded-lg border border-border bg-surface px-2.5 text-[12px] text-text transition-colors duration-150'

export function AdvancedFilters({
	values,
	onApply,
}: {
	values: AdvancedValues
	onApply: (next: AdvancedValues) => void
}) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState(values)
	const ref = useRef<HTMLDivElement>(null)
	const active = countActive(values)

	useEffect(() => {
		if (open) setDraft(values)
	}, [open, values])

	// fecha ao clicar fora / Esc — popover só é melhor que modal se sair fácil
	useEffect(() => {
		if (!open) return
		const onDown = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
		document.addEventListener('mousedown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	const set = (key: keyof AdvancedValues) => (value: string) =>
		setDraft((d) => ({ ...d, [key]: value }))

	return (
		<div className='relative' ref={ref}>
			<button
				onClick={() => setOpen((o) => !o)}
				className={cn(
					'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors duration-150',
					active > 0
						? 'border-lime-mid bg-lime-soft font-medium text-lime-fg'
						: 'border-border bg-surface text-text-2 hover:border-muted hover:text-text',
				)}
			>
				<SlidersHorizontal size={12} />
				{t('filters.advanced')}
				{active > 0 && (
					<span className='font-num rounded-full bg-lime px-1.5 text-[10px] font-semibold text-lime-ink'>
						{active}
					</span>
				)}
			</button>

			{open && (
				<div className='absolute right-0 z-40 mt-2 w-[520px] rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-pop)]'>
					<div className='mb-3 flex items-center justify-between'>
						<p className='font-display text-[13px] font-semibold'>{t('filters.advancedTitle')}</p>
						<button
							onClick={() => setOpen(false)}
							className='text-muted transition-colors hover:text-text'
							aria-label={t('filters.close')}
						>
							<X size={14} />
						</button>
					</div>

					<div className='grid grid-cols-2 gap-3'>
						<Field label={t('filters.language')}>
							<select className={inputCls} value={draft.language} onChange={(e) => set('language')(e.target.value)}>
								<option value='all'>{t('jobs.optionAll')}</option>
								{LANGUAGES.map((v) => (
									<option key={v} value={v}>{t(`languages.${v}`)}</option>
								))}
							</select>
						</Field>
						<Field label={t('filters.segment')}>
							{/* 79 categorias: no nativo seria rolar procurando */}
							<SearchableSelect
								value={draft.segment === 'all' ? '' : draft.segment}
								onChange={(v) => set('segment')(v || 'all')}
								placeholder={t('jobs.optionAll')}
								options={SEGMENTS.map((v) => ({ value: v, label: v }))}
							/>
						</Field>
						<Field label={t('filters.level')}>
							<select className={inputCls} value={draft.level} onChange={(e) => set('level')(e.target.value)}>
								<option value='all'>{t('jobs.optionAll')}</option>
								{LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
							</select>
						</Field>
						<Field label={t('filters.country')}>
							<input className={inputCls} value={draft.country} onChange={(e) => set('country')(e.target.value)} placeholder={t('filters.countryPlaceholder')} />
						</Field>
						<Field label={t('filters.state')}>
							<input className={inputCls} value={draft.state} onChange={(e) => set('state')(e.target.value)} placeholder={t('filters.statePlaceholder')} />
						</Field>
						<Field label={t('filters.city')}>
							<input className={inputCls} value={draft.city} onChange={(e) => set('city')(e.target.value)} placeholder={t('filters.cityPlaceholder')} />
						</Field>
					</div>

					<div className='mt-4 flex items-center justify-between'>
						<button
							onClick={() => setDraft(EMPTY_ADVANCED)}
							className='text-[12px] text-text-2 transition-colors hover:text-text'
						>
							{t('filters.clear')}
						</button>
						<div className='flex gap-2'>
							<Button variant='secondary' size='sm' onClick={() => setOpen(false)}>
								{t('filters.cancel')}
							</Button>
							<Button
								variant='primary'
								size='sm'
								onClick={() => {
									onApply(draft)
									setOpen(false)
								}}
							>
								{t('filters.apply')}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

/** Chips do que está ativo — o filtro fica visível SEM reabrir o painel. */
export function ActiveFilterChips({
	values,
	onRemove,
}: {
	values: AdvancedValues
	onRemove: (key: keyof AdvancedValues) => void
}) {
	const { t } = useTranslation()
	const entries = (Object.entries(values) as Array<[keyof AdvancedValues, string]>).filter(
		([k, v]) => v !== EMPTY_ADVANCED[k],
	)
	if (entries.length === 0) return null

	return (
		<div className='mb-3 flex flex-wrap items-center gap-1.5'>
			{entries.map(([key, value]) => (
				<span
					key={key}
					className='inline-flex items-center gap-1 rounded-full bg-lime-soft px-2 py-0.5 text-[11px] font-medium text-lime-fg'
				>
					{t(`filters.${key}`)}: {value}
					<button
						onClick={() => onRemove(key)}
						className='transition-opacity hover:opacity-70'
						aria-label={t('filters.remove')}
					>
						<X size={10} />
					</button>
				</span>
			))}
		</div>
	)
}
