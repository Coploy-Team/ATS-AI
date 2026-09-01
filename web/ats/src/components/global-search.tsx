import { Link } from '@tanstack/react-router'
import {
	Briefcase,
	CornerDownLeft,
	LayoutDashboard,
	Search,
	Users,
	X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { cn } from '@/lib/cn'
import { refId } from '@/lib/ref'
import { Kbd } from '@/ui/kbd'

/**
 * Busca global (⌘K).
 *
 * Sem rota nova: `find` já existe em `/companies/jobs` e em
 * `/companies/interviews`, e é o mesmo parâmetro que as telas de Vagas e
 * Candidatos usam. Uma busca global que precisasse de endpoint próprio traria
 * um segundo jeito de procurar a mesma coisa — e os dois divergiriam.
 *
 * Três grupos, nesta ordem: **ir para** (navegação, responde na hora e sem
 * rede), **vagas** e **pessoas**. Quem aperta ⌘K quase sempre quer trocar de
 * tela; procurar alguém é o caso mais raro e o mais caro.
 */
interface Item {
	key: string
	group: 'nav' | 'job' | 'person'
	title: string
	subtitle?: string
	/*
	 * O destino é DADO, e a linha é um `<Link>` de verdade.
	 *
	 * A primeira versão guardava um `navigate()` imperativo e não saía do lugar:
	 * o diálogo fechava e a rota continuava a mesma. Link também dá de graça o
	 * que um botão nunca dá — nova aba, botão do meio, copiar endereço.
	 */
	to: string
	params?: Record<string, string>
	search?: Record<string, string>
}

const MIN_QUERY = 2

/** Rotas alcançáveis pelo teclado. Rótulo vem do i18n do menu. */
const NAV: Array<{ key: string; to: string; labelKey: string }> = [
	{ key: 'dashboard', to: '/dashboard', labelKey: 'nav.dashboard' },
	{ key: 'jobs', to: '/vagas', labelKey: 'nav.jobs' },
	{ key: 'newJob', to: '/vagas/nova', labelKey: 'jobs.create' },
	{ key: 'candidates', to: '/candidatos', labelKey: 'nav.candidates' },
	{ key: 'hunting', to: '/hunting', labelKey: 'nav.hunting' },
	{ key: 'analytics', to: '/analytics', labelKey: 'nav.analytics' },
	{ key: 'team', to: '/time', labelKey: 'nav.team' },
	{ key: 'integrations', to: '/integracoes', labelKey: 'nav.integrations' },
	{ key: 'settings', to: '/configuracoes', labelKey: 'nav.settings' },
]

/** "vaga" acha "Vagas"; "analitico" acha "Analytics" sem o acento certo. */
function normalize(value: string) {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim()
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t } = useTranslation()
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	const [query, setQuery] = useState('')
	const [debounced, setDebounced] = useState('')
	const [highlight, setHighlight] = useState(0)

	useEffect(() => {
		if (!open) return
		setQuery('')
		setDebounced('')
		setHighlight(0)
		const timer = setTimeout(() => inputRef.current?.focus(), 0)
		return () => clearTimeout(timer)
	}, [open])

	/*
	 * A navegação filtra a cada tecla (é uma lista em memória); a rede espera.
	 * Sem isso, uma palavra de oito letras vira oito pares de requisições.
	 */
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query.trim()), 220)
		return () => clearTimeout(timer)
	}, [query])

	const term = debounced.length >= MIN_QUERY ? debounced : ''
	const enabled = open && term.length > 0

	const { data: jobsData, isFetching: fetchingJobs } = empresa.useGetCompaniesJobs(
		{ limit: '5', find: term, status: 'all' },
		{ query: { enabled } },
	)
	const { data: peopleData, isFetching: fetchingPeople } = empresa.useGetCompaniesInterviews(
		{ limit: '5', groupBy: 'candidate', find: term },
		{ query: { enabled } },
	)

	const items = useMemo<Item[]>(() => {
		const typed = normalize(query)

		const nav: Item[] = NAV.filter((entry) => {
			if (!typed) return true
			return normalize(t(entry.labelKey)).includes(typed)
		}).map((entry) => ({
			key: `nav:${entry.key}`,
			group: 'nav' as const,
			title: t(entry.labelKey),
			to: entry.to,
		}))

		if (!term) return nav.slice(0, 6)

		const jobs: Item[] = (
			(jobsData?.data.jobs ?? []) as Array<Record<string, unknown>>
		).map((job) => ({
			key: `job:${String(job.id)}`,
			group: 'job' as const,
			title: (job.jobName as string) || String(job.id),
			subtitle: [job.identifier, job.level].filter(Boolean).join(' · ') || undefined,
			to: '/vagas/$jobId/pipeline',
			params: { jobId: String(job.id) },
		}))

		/*
		 * O destino da pessoa é o dossiê dela NA VAGA — é o que o ATS sabe
		 * mostrar. Sem `jobId` (registro antigo sem vaga resolvida) a linha leva
		 * para a base de candidatos já filtrada pelo nome, em vez de sumir.
		 */
		const people: Item[] = (
			(peopleData?.data.interviews ?? []) as Array<Record<string, unknown>>
		).map((row, index) => {
			const name = ((row.name as string) || '').trim() || '—'
			const jobId = refId(row.job_ref)
			const candidateId = row.id ? String(row.id) : ''
			const reachable = Boolean(jobId && candidateId)
			return {
				key: `person:${refId(row.user_ref) ?? candidateId ?? index}`,
				group: 'person' as const,
				title: name,
				subtitle:
					[row.occupation, row.jobName].filter(Boolean).join(' · ') || undefined,
				to: reachable ? '/vagas/$jobId/candidatos/$candidateId' : '/candidatos',
				...(reachable
					? { params: { jobId: jobId as string, candidateId } }
					: { search: { busca: name } }),
			}
		})

		return [...nav.slice(0, 4), ...jobs, ...people]
	}, [query, term, jobsData, peopleData, t])

	useEffect(() => {
		setHighlight(0)
	}, [items.length])

	// a seta só serve se o item destacado estiver visível
	useEffect(() => {
		listRef.current
			?.querySelector<HTMLElement>('[data-active="true"]')
			?.scrollIntoView({ block: 'nearest' })
	}, [highlight])

	if (!open) return null

	const fetching = enabled && (fetchingJobs || fetchingPeople)
	const groups: Array<{ group: Item['group']; label: string; icon: typeof Search }> = [
		{ group: 'nav', label: t('search.groupNav'), icon: LayoutDashboard },
		{ group: 'job', label: t('search.groupJobs'), icon: Briefcase },
		{ group: 'person', label: t('search.groupPeople'), icon: Users },
	]

	function onKeyDown(event: React.KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault()
			onClose()
			return
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			setHighlight((current) => Math.min(items.length - 1, current + 1))
			return
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault()
			setHighlight((current) => Math.max(0, current - 1))
			return
		}
		if (event.key === 'Enter') {
			event.preventDefault()
			/*
			 * O teclado clica o MESMO link que o mouse clicaria. Reimplementar a
			 * navegação aqui é como Enter e clique passam a divergir.
			 */
			listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.click()
		}
	}

	return (
		<div
			className='fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-3 pt-[12vh] backdrop-blur-[2px]'
			onClick={onClose}
		>
			<div
				role='dialog'
				aria-modal='true'
				aria-label={t('search.title')}
				className='w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-lg'
				onClick={(event) => event.stopPropagation()}
			>
				<div className='relative border-b border-border-soft'>
					<Search
						size={15}
						className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted'
					/>
					<input
						ref={inputRef}
						type='text'
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={onKeyDown}
						placeholder={t('search.placeholder')}
						autoComplete='off'
						spellCheck={false}
						/* gerenciadores de senha tentam preencher qualquer campo de texto */
						data-1p-ignore='true'
						data-lpignore='true'
						data-form-type='other'
						className='h-12 w-full bg-transparent pl-11 pr-11 text-[14px] text-text outline-none placeholder:text-muted'
					/>
					<button
						type='button'
						onClick={onClose}
						aria-label={t('search.close')}
						className='absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:bg-hover hover:text-text'
					>
						<X size={14} />
					</button>
				</div>

				<div ref={listRef} className='max-h-[56vh] overflow-y-auto p-2'>
					{items.length === 0 && (
						<p className='px-3 py-10 text-center text-[12.5px] text-muted'>
							{fetching ? t('search.searching') : t('search.empty', { query })}
						</p>
					)}

					{groups.map(({ group, label, icon: Icon }) => {
						const rows = items.filter((item) => item.group === group)
						if (rows.length === 0) return null
						return (
							<div key={group} className='mb-1.5 last:mb-0'>
								<div className='px-3 py-1 text-[10px] uppercase tracking-wider text-muted'>
									{label}
								</div>
								{rows.map((item) => {
									const index = items.indexOf(item)
									const active = index === highlight
									return (
										<Link
											key={item.key}
											to={item.to as never}
											params={item.params as never}
											search={item.search as never}
											data-active={active}
											onClick={onClose}
											onMouseEnter={() => setHighlight(index)}
											className={cn(
												'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors',
												active && 'bg-hover',
											)}
										>
											<span
												className={cn(
													'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
													active
														? 'bg-lime-soft text-lime-fg'
														: 'bg-card-alt text-text-2',
												)}
											>
												<Icon size={13} />
											</span>
											<span className='min-w-0 flex-1'>
												<span className='block truncate text-[13px]'>{item.title}</span>
												{item.subtitle && (
													<span className='block truncate text-[11.5px] text-muted'>
														{item.subtitle}
													</span>
												)}
											</span>
											{active && <CornerDownLeft size={12} className='shrink-0 text-muted' />}
										</Link>
									)
								})}
							</div>
						)
					})}

					{/* o rodapé não some enquanto busca: a lista antiga continua utilizável */}
					{fetching && items.length > 0 && (
						<p className='px-3 py-1.5 text-[11.5px] text-muted'>{t('search.searching')}</p>
					)}
				</div>

				<div className='flex items-center gap-3 border-t border-border-soft bg-card-alt px-3 py-2 text-[11px] text-muted'>
					<span className='inline-flex items-center gap-1'>
						<Kbd>↑↓</Kbd> {t('search.hintMove')}
					</span>
					<span className='inline-flex items-center gap-1'>
						<Kbd>↵</Kbd> {t('search.hintOpen')}
					</span>
					<span className='inline-flex items-center gap-1'>
						<Kbd>esc</Kbd> {t('search.hintClose')}
					</span>
				</div>
			</div>
		</div>
	)
}
