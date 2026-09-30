import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

export interface JobOption {
	id: string
	name: string
	identifier?: string | null
	candidateCount?: number | null
	stalledCount?: number | null
}

/**
 * Seletor de vaga do Pipeline.
 *
 * Não é um `<select>` porque a conta real tem dezenas de vagas com nomes
 * repetidos ("Fiscal de Ônibus" três vezes) — sem busca e sem contexto, a
 * lista nativa é indistinguível. Aqui cada linha carrega identificador e
 * quantos candidatos estão parados, que é como o recrutador reconhece a vaga
 * que ele quer abrir.
 */
export function JobPicker({
	jobs,
	value,
	onChange,
	loading,
}: {
	jobs: JobOption[]
	value: string
	onChange: (jobId: string) => void
	loading?: boolean
}) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const ref = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)

	const selected = jobs.find((job) => job.id === value)

	useEffect(() => {
		if (!open) {
			setQuery('')
			return
		}
		inputRef.current?.focus()
		const onPointerDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [open])

	const filtered = useMemo(() => {
		const term = query.trim().toLowerCase()
		if (!term) return jobs
		// casa por nome OU identificador: quem sabe o código não devia digitar o nome
		return jobs.filter(
			(job) =>
				job.name.toLowerCase().includes(term) ||
				(job.identifier ?? '').toLowerCase().includes(term),
		)
	}, [jobs, query])

	return (
		<div ref={ref} className='relative'>
			<button
				onClick={() => setOpen((v) => !v)}
				className='flex h-8 max-w-[280px] items-center gap-2 rounded-[10px] border border-border px-3 text-[12.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
			>
				<span className='truncate'>
					{loading
						? t('jobs.loading')
						: selected
							? `${t('pipeline.job')}: ${selected.identifier || selected.name}`
							: t('pipeline.pickJob')}
				</span>
				<ChevronDown size={12} className='shrink-0' />
			</button>

			{/*
			 * Painel ancorado à ESQUERDA do botão.
			 *
			 * Com `right-0` os 340px cresciam para a esquerda a partir da borda
			 * direita do gatilho — e como este seletor é o primeiro item da toolbar,
			 * logo depois da sidebar, ele vazava para fora da viewport e a lista
			 * aparecia com as primeiras letras cortadas. À direita há espaço
			 * sobrando; o teto de largura cobre telas estreitas.
			 */}
			{open && (
				<div className='absolute left-0 top-9 z-40 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-pop)]'>
					<div className='flex items-center gap-2 border-b border-border-soft px-3 py-2'>
						<Search size={13} className='shrink-0 text-muted' />
						<input
							ref={inputRef}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={t('pipeline.searchJob')}
							className='w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-muted'
						/>
					</div>

					<div className='max-h-[320px] overflow-y-auto py-1'>
						{filtered.length === 0 && (
							<p className='px-3 py-6 text-center text-[12px] text-muted'>
								{t('pipeline.noJobMatch')}
							</p>
						)}
						{filtered.map((job) => (
							<button
								key={job.id}
								onClick={() => {
									onChange(job.id)
									setOpen(false)
								}}
								className={cn(
									'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-hover',
									job.id === value && 'bg-lime-soft',
								)}
							>
								<Check
									size={13}
									className={cn(
										'mt-0.5 shrink-0',
										job.id === value ? 'text-lime-fg' : 'text-transparent',
									)}
								/>
								<span className='min-w-0 flex-1'>
									<span className='block truncate text-[12.5px] font-medium'>{job.name}</span>
									<span className='mt-0.5 flex items-center gap-1.5 text-[11px] text-muted'>
										{job.identifier && <span className='font-num'>{job.identifier}</span>}
										{job.identifier && <span>·</span>}
										<span className='font-num'>
											{t('pipeline.summary', { count: job.candidateCount ?? 0 })}
										</span>
										{Boolean(job.stalledCount) && (
											<>
												<span>·</span>
												<span className='font-num text-amber'>
													{t('pipeline.stalledShort', { count: job.stalledCount ?? 0 })}
												</span>
											</>
										)}
									</span>
								</span>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	)
}
