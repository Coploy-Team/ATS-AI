import { ChevronLeft, ChevronRight, Download, Lock, MapPin, RefreshCw, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Link, Navigate } from '@tanstack/react-router'

import { empresa } from '@coploy/sdk/react'

import { IntentBar, type Criteria } from './intent-bar'
import { HUNTING_LEVELS } from '@/features/job-form/job-options'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { FilterPill } from '@/ui/filter-pill'
import { Banner, Page } from '@/ui/page'
import { csvFilename, downloadCsv, toCsv } from '@/lib/csv'
import { ViewToggle, type ViewMode } from '@/ui/view-toggle'

const PAGE_SIZE = '24'

/**
 * Hunting — busca no pool de candidatos que já passaram por uma entrevista
 * com IA em qualquer empresa da rede e estão visíveis.
 *
 * É o diferencial estrutural da Coploy: em ATS comum, buscar talento é ler
 * currículo (declaração). Aqui cada perfil vem com NOTA de uma entrevista
 * real — evidência, não autopromoção. Por isso o card lidera pela nota e
 * pelas skills que a IA verificou, e não pela foto.
 */
export function HuntingPage() {
	const { features } = useCapabilities()
	/*
	 * Hunting é efeito de rede do SaaS : nesta edição a
	 * tela não existe — quem chegar por URL direta volta pra casa em vez de
	 * ver um pool que nunca terá ninguém.
	 */
	if (!features.hunting) return <Navigate to='/dashboard' replace />
	return <HuntingPageInner />
}

function HuntingPageInner() {
	const { can } = useCapabilities()
	const [intent, setIntent] = useState<Criteria>({})
	/*
	 * Afrouxamento automático.
	 *
	 * Filtro só sabe cortar, e a nossa base é de quem fez entrevista aqui — não
	 * de milhões de perfis. Combinar quatro critérios zera a lista com
	 * facilidade, e tela vazia depois de descrever o que se procura é a pior
	 * resposta possível: parece que não temos ninguém, quando na verdade temos
	 * gente perto do pedido.
	 *
	 * Então, quando a busca não devolve ninguém, soltamos um filtro por vez —
	 * do mais restritivo para o menos — até aparecer alguém, e dizemos o que foi
	 * solto. `find` nunca é solto: sem ele a lista deixaria de ser sobre o
	 * pedido.
	 */
	const [dropped, setDropped] = useState<string[]>([])
	const effective = useMemo(() => {
		const next: Criteria = { ...intent }
		for (const key of dropped) delete next[key]
		return next
	}, [intent, dropped])
	const { t } = useTranslation()
	const [search, setSearch] = useState('')
	const [debounced, setDebounced] = useState('')
	const [level, setLevel] = useState('')
	const [country, setCountry] = useState('')
	const [state, setState] = useState('')
	const [skill, setSkill] = useState('')
	const [minScore, setMinScore] = useState('')
	/** Cursores empilhados: cada página guarda o ponto de entrada da anterior. */
	const [cursors, setCursors] = useState<string[]>([])

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebounced(search.trim())
			setCursors([])
		}, 350)
		return () => clearTimeout(timer)
	}, [search])

	// trocar filtro volta pra primeira página: manter o cursor daria resultado
	// de uma busca que não existe mais
	useEffect(() => setCursors([]), [level, country, state, skill, minScore])

	const { data, isLoading, isFetching, isError, refetch } = empresa.useGetPublicInterviews({
		limit: PAGE_SIZE,
		...(cursors.length > 0 ? { cursor: cursors[cursors.length - 1] } : {}),
		...(debounced ? { find: debounced } : {}),
		...(level ? { careerLevel: level as never } : {}),
		...(country ? { country } : {}),
		...(state ? { state } : {}),
		...(skill ? { hardSkillTag: skill } : {}),
		...(minScore ? { minScoreGeral: minScore } : {}),
		/*
		 * O que o assistente interpretou entra por último e vence os filtros
		 * manuais: quem acabou de descrever o que procura espera ver aquilo, não
		 * a combinação com o que sobrou de uma busca anterior.
		 */
		...(effective as Record<string, never>),
	})

	const { data: summaryData } = empresa.useGetPublicInterviewsSummary()
	const summary = summaryData?.data as { total?: number } | undefined

	const payload = data?.data as
		| { interviews?: Array<Record<string, unknown>>; nextCursor?: string | null; hasMore?: boolean }
		| undefined
	const people = useMemo(() => payload?.interviews ?? [], [payload])

	/*
	 * Do mais restritivo para o menos. Nota mínima e pontuação de skill cortam
	 * mais que localização, e `find` fica de fora: soltá-lo devolveria uma lista
	 * que não tem relação com o que foi pedido.
	 */
	const RELAX_ORDER = [
		'minScoreGeral',
		'minYearsExperience',
		'minHardSkillPontuacao',
		'hardSkillTag',
		'porteEmpresa',
		'tipoEmpresaIdeal',
		'city',
		'state',
		'senioridadeNivel',
		'careerLevel',
		'country',
	]

	useEffect(() => {
		if (isLoading || isFetching || people.length > 0) return
		const next = RELAX_ORDER.find((key) => key in intent && !dropped.includes(key))
		if (next) setDropped((current) => [...current, next])
		// `RELAX_ORDER` é constante; incluí-la nas deps só adiciona ruído
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [people.length, isLoading, isFetching, intent, dropped])

	/** Busca nova recomeça do zero: o afrouxamento é do pedido anterior. */
	function applyIntent(next: Criteria) {
		setDropped([])
		setIntent(next)
	}
	const [view, setView] = useState<ViewMode>('grid')
	const nextCursor = payload?.nextCursor ?? null
	const hasMore = payload?.hasMore === true && Boolean(nextCursor)

	/*
	 * Exporta a página visível.
	 *
	 * O Hunting pagina por cursor: não existe "todos os resultados" para buscar
	 * sem varrer o pool inteiro. Exportar o que está na tela é honesto — e o
	 * nome do arquivo carrega a data para não sobrescrever o anterior.
	 */
	function exportCsv() {
		const headers = [
			t('candidates.candidate'),
			t('candidates.occupation'),
			t('hunting.level'),
			t('candidates.score'),
			t('hunting.skills'),
		]
		const body = (people as Array<Record<string, unknown>>).map((person) => [
			String(person.name ?? ''),
			String(person.occupation ?? ''),
			String(person.career_level ?? ''),
			String(person.score ?? ''),
			skillsOf(person).join(' | '),
		])
		downloadCsv(toCsv(headers, body), csvFilename('hunting'))
	}

	/*
	 * O banco de talentos é a base inteira, não a vaga que alguém mostrou ao
	 * convidado. Sem `talent:read` a tela nem abre — esconder só os botões
	 * deixaria a lista de pessoas visível, que é justamente o dado protegido.
	 */
	if (!can('talent:read')) {
		return (
			<Page title={t('hunting.title')} subtitle={t('hunting.subtitle')}>
				<div className='rounded-xl border border-border bg-card px-4 py-16 text-center'>
					<Lock size={20} className='mx-auto mb-2 text-muted' />
					<p className='text-[13px] font-medium'>{t('hunting.noPermissionTitle')}</p>
					<p className='mt-0.5 text-[12px] text-muted'>{t('hunting.noPermissionHint')}</p>
				</div>
			</Page>
		)
	}

	return (
		<Page
			title={t('hunting.title')}
			subtitle={
				<>
					{t('hunting.subtitle')}
					{summary?.total ? (
						<span className='font-num text-muted'>
							{' · '}
							{t('hunting.poolSize', { count: summary.total })}
						</span>
					) : null}
				</>
			}
			actions={
				<Button variant='secondary' size='sm' onClick={exportCsv} disabled={people.length === 0}>
					<Download size={12} /> {t('export.action')}
				</Button>
			}
		>
			{/*
			 * A busca em português vem ANTES dos filtros: é o caminho principal, e
			 * os campos continuam ali para quem já sabe exatamente o que quer.
			 */}
			<div className='mb-3'>
				<IntentBar criteria={intent} onApply={applyIntent} relaxed={dropped} />
			</div>

			<div className='mb-4 flex flex-wrap items-center gap-2'>
				<div className='flex h-8 min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-2.5'>
					<Search size={13} className='shrink-0 text-muted' />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t('hunting.searchPlaceholder')}
						className='w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-muted'
					/>
				</div>

				<FilterPill
					label={t('hunting.level')}
					value={level}
					defaultValue=''
					options={[
						{ value: '', label: t('hunting.allLevels') },
						...HUNTING_LEVELS.map((value) => ({ value, label: value })),
					]}
					onChange={setLevel}
				/>

				<FilterPill
					label={t('hunting.minScore')}
					value={minScore}
					defaultValue=''
					options={[
						{ value: '', label: t('hunting.anyScore') },
						...['9', '8', '7', '6'].map((value) => ({
							value,
							label: t('hunting.scoreAtLeast', { score: value }),
						})),
					]}
					onChange={setMinScore}
				/>

				<input
					value={skill}
					onChange={(e) => setSkill(e.target.value)}
					placeholder={t('hunting.skill')}
					className='h-8 w-[150px] rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text placeholder:text-muted'
				/>
				<input
					value={country}
					onChange={(e) => setCountry(e.target.value)}
					placeholder={t('hunting.country')}
					className='h-8 w-[130px] rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text placeholder:text-muted'
				/>
				<input
					value={state}
					onChange={(e) => setState(e.target.value)}
					placeholder={t('hunting.state')}
					className='h-8 w-[90px] rounded-lg border border-border bg-surface px-2.5 text-[12.5px] text-text placeholder:text-muted'
				/>

				{(level || country || state || skill || minScore || search) && (
					<button
						onClick={() => {
							setLevel('')
							setCountry('')
							setState('')
							setSkill('')
							setMinScore('')
							setSearch('')
						}}
						className='text-[12px] text-muted transition-colors hover:text-text'
					>
						{t('filters.clear')}
					</button>
				)}

				<ViewToggle value={view} onChange={setView} />
			</div>

			{isError && (
				<Banner
					tone='danger'
					actions={
						<Button variant='secondary' size='sm' onClick={() => refetch()}>
							<RefreshCw size={12} /> {t('jobs.retry')}
						</Button>
					}
				>
					{t('hunting.error')}
				</Banner>
			)}

			{!isError && (
				<div
					className={cn(
						'grid auto-rows-min gap-3',
						// lista = uma coluna; grade = o mosaico de sempre
						view === 'grid'
							? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
							: 'grid-cols-1',
						isFetching && 'opacity-60',
					)}
				>
					{isLoading &&
						Array.from({ length: 8 }, (_, i) => (
							<div key={i} className='h-[150px] animate-pulse rounded-xl bg-card-alt' />
						))}

					{!isLoading && people.length === 0 && (
						<div className='col-span-full py-16 text-center'>
							<Sparkles size={20} className='mx-auto mb-2 text-muted' />
							<p className='text-[13px] font-medium'>{t('hunting.emptyTitle')}</p>
							<p className='mt-0.5 text-[12px] text-muted'>{t('hunting.emptyHint')}</p>
						</div>
					)}

					{people.map((person) => (
						<TalentCard key={String(person.id)} person={person} />
					))}
				</div>
			)}

			{/* paginação por cursor: a pilha guarda o ponto de entrada de cada
			    página, então "anterior" volta de verdade em vez de recomeçar */}
			{!isError && (people.length > 0 || cursors.length > 0) && (
				<div className='mt-4 flex items-center justify-between gap-3'>
					<Button
						variant='secondary'
						size='sm'
						disabled={cursors.length === 0 || isFetching}
						onClick={() => setCursors((current) => current.slice(0, -1))}
					>
						<ChevronLeft size={13} /> {t('pagination.previous')}
					</Button>

					<span className='font-num text-[12px] text-muted'>
						{t('hunting.pageOf', { page: cursors.length + 1 })}
					</span>

					<Button
						variant='secondary'
						size='sm'
						disabled={!hasMore || isFetching}
						onClick={() => nextCursor && setCursors((current) => [...current, nextCursor])}
					>
						{t('pagination.next')} <ChevronRight size={13} />
					</Button>
				</div>
			)}
		</Page>
	)
}

/** Skills do talento — o card mostra as 5 primeiras; o export leva todas. */
function skillsOf(person: Record<string, unknown>): string[] {
	if (!Array.isArray(person.interview_tags)) return []
	return (person.interview_tags as Array<{ hard_skills?: Array<{ tag?: string }> }>)
		.flatMap((group) => group.hard_skills ?? [])
		.map((skill) => skill.tag)
		.filter((tag): tag is string => Boolean(tag))
}

function TalentCard({ person }: { person: Record<string, unknown> }) {
	const { t } = useTranslation()
	const name = String(person.name ?? '—')
	const raw = person.score
	const score =
		raw === null || raw === undefined
			? null
			: /* zero é nota, não ausência: `|| null` a apagava da lista */
				(() => {
					const parsed = Number.parseFloat(String(raw).replace(',', '.'))
					return Number.isFinite(parsed) ? parsed : null
				})()

	const location = [person.city, person.state, person.country]
		.map((part) => (typeof part === 'string' ? part.trim() : ''))
		// o dado real vem sujo do form: "-" é placeholder, não endereço
		.filter((part) => part && part !== '-')
		.join(', ')

	const tags = skillsOf(person).slice(0, 5)

	// `user_ref` vem como `{ id, path }` do Firestore; tratar só string
	// deixava o card sem link pra maioria dos perfis
	const ref = person.user_ref as { id?: string; path?: string } | string | undefined
	const userId =
		typeof ref === 'string'
			? (ref.split('/').pop() ?? null)
			: (ref?.id ?? ref?.path?.split('/').pop() ?? null)

	return (
		<Link
			// sem userId não há entrevista pra abrir; o card vira leitura
			to={userId ? '/hunting/$userId' : '/hunting'}
			params={userId ? { userId } : undefined}
			className={cn(
				'flex flex-col rounded-xl border border-border bg-card p-3.5 transition-all duration-150',
				userId && 'hover:-translate-y-0.5 hover:border-lime-mid hover:shadow-[var(--shadow-pop)]',
			)}
		>
			<div className='flex items-start gap-2.5'>
				{typeof person.photo_url === 'string' && person.photo_url ? (
					<img
						src={person.photo_url}
						alt=''
						loading='lazy'
						width={36}
						height={36}
						className='h-9 w-9 shrink-0 rounded-full object-cover'
					/>
				) : (
					<span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card-alt text-[11px] font-semibold text-text-2'>
						{name.slice(0, 2).toUpperCase()}
					</span>
				)}

				<div className='min-w-0 flex-1'>
					<p className='truncate text-[13px] font-medium leading-tight'>{name}</p>
					{typeof person.occupation === 'string' && person.occupation && (
						<p className='truncate text-[11.5px] text-muted'>{person.occupation}</p>
					)}
				</div>

				{/* a nota lidera o card: é ela que separa evidência de currículo */}
				{score !== null && (
					<span
						className={cn(
							'font-num shrink-0 rounded-md border px-1.5 py-0.5 text-[12px] font-semibold',
							score >= 8 ? 'border-lime-mid text-lime-fg' : 'border-border text-text-2',
						)}
					>
						{score.toFixed(1).replace('.', ',')}
					</span>
				)}
			</div>

			{location && (
				<p className='mt-2 inline-flex items-center gap-1 text-[11px] text-muted'>
					<MapPin size={11} /> {location}
				</p>
			)}

			{tags.length > 0 && (
				<div className='mt-2.5 flex flex-wrap gap-1'>
					{tags.map((tag) => (
						<span
							key={tag}
							className='rounded border border-border px-1.5 py-0.5 text-[10.5px] text-text-2'
						>
							{tag}
						</span>
					))}
				</div>
			)}

			<div className='mt-auto flex items-center justify-between gap-2 pt-2.5'>
				{typeof person.career_level === 'string' && person.career_level ? (
					<span className='text-[11px] text-muted'>
						{t('hunting.levelLabel', { level: person.career_level })}
					</span>
				) : (
					<span />
				)}
				{userId && (
					<span className='inline-flex items-center gap-1 text-[11px] font-medium text-lime-fg'>
						{t('hunting.openInterview')} <ChevronRight size={11} />
					</span>
				)}
			</div>
		</Link>
	)
}
