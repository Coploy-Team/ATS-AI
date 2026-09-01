import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCorners,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowDownToLine, ArrowDownUp, ChevronLeft, ChevronRight, Lock, MoveRight, RefreshCw, Search, Settings2, Share2, ShieldQuestion, Video, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { formatDuration } from '@/features/jobs/map'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Kbd } from '@/ui/kbd'
import { FilterPill } from '@/ui/filter-pill'
import { ToggleChip } from '@/ui/segmented'
import { Tooltip } from '@/ui/tooltip'

import { UndoToast } from '@/ui/undo-toast'

import { AdoptionInvite } from './adoption-invite'
import { InviteModal } from './invite-modal'
import { JobPicker } from './job-picker'
import { toPipelineCard, type PipelineCard } from './map'
import { RankingPanel } from './ranking-panel'
import { RejectionModal, type RejectionPayload } from './rejection-modal'
import { useMoveCandidate } from './use-move-candidate'
import { usePipelineStages, type PipelineStageView } from './use-pipeline-stages'
import { ShareDialog } from './share-dialog'

/** O board precisa de TODOS os candidatos, não da primeira página. */
const BOARD_LIMIT = '200'

/**
 * Ordens que o board oferece.
 *
 * `field` é limitado ao que a API aceita (`date`, `score`, `name`) — "parados há
 * mais tempo" seria `dateSelect` e não existe lá; esse caso continua coberto
 * pelo filtro "só parados", que é local.
 */
const ORDERS = [
	{ key: 'nota', field: 'score', direction: 'desc' },
	{ key: 'recentes', field: 'date', direction: 'desc' },
	{ key: 'antigos', field: 'date', direction: 'asc' },
	{ key: 'nome', field: 'name', direction: 'asc' },
] as const
const COLLAPSED_KEY = 'coploy.ats.pipeline.collapsed'
/** A partir daqui a coluna de espera vira resumo em vez de lista. */
const LIMIAR_DE_FILA = 12
/** Parado além disto = o candidato está esperando demais (anti-ghosting). */
const STALLED_DAYS = 5
/** A partir daqui a nota vira destaque em lime. */
const HIGH_SCORE = 8

export function PipelinePage({ jobId: fixedJobId }: { jobId?: string } = {}) {
	const { t } = useTranslation()
	const navigate = useNavigate()
	/**
	 * A vaga vive na URL, não em estado local: é o que faz "abrir pipeline"
	 * a partir de uma vaga cair na vaga certa, o link ser compartilhável e o
	 * botão voltar do navegador funcionar.
	 *
	 * Dentro da vaga (`/vagas/:id/pipeline`) o id vem por prop e o seletor some —
	 * escolher a vaga de novo, já estando dentro dela, era a duplicação que
	 * motivou a mudança de navegação. `strict: false` porque o mesmo componente
	 * roda nas duas rotas.
	 */
	const routeSearch = useSearch({ strict: false }) as { vaga?: string; ordem?: string }
	const embedded = Boolean(fixedJobId)
	const jobId = fixedJobId ?? routeSearch.vaga ?? ''

	const setJobId = (next: string) =>
		navigate({ to: '/vagas/$jobId/pipeline', params: { jobId: next } })

	const setOrder = (next: string) =>
		navigate({ to: '.', search: { ...routeSearch, ordem: next }, replace: true })
	const [onlyStalled, setOnlyStalled] = useState(false)
	const [search, setSearch] = useState('')
	/** Só quem já tem nota — o recrutador que quer decidir filtra por isto. */
	const [onlyScored, setOnlyScored] = useState(false)
	const [minScore, setMinScore] = useState('')
	const [collapsed, setCollapsed] = useState<string[]>(() => {
		try {
			const stored = localStorage.getItem(COLLAPSED_KEY)
			/*
			 * NASCE ABERTO.
			 *
			 * Eu recolhia contratado e reprovado na primeira visita para caber 6
			 * etapas × 290px na tela. Os testadores pediram o contrário: "melhor vir
			 * aberto, pensando na experiência" — o funil inteiro à vista vale mais
			 * que a rolagem que ele custa, porque o pipeline existe justamente para
			 * mostrar onde as pessoas estão. Recolher continua na mão de quem quer.
			 */
			return stored ? JSON.parse(stored) : []
		} catch {
			return []
		}
	})

	useEffect(() => {
		localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed))
	}, [collapsed])


	/*
	 * Só recolhe o que a PESSOA recolheu.
	 *
	 * Coluna vazia também nascia recolhida, o que somado ao padrão acima deixava
	 * metade do quadro em tiras. A etapa vazia tem informação: "não tem ninguém
	 * aqui" é o que o recrutador precisa ver para saber onde o funil trava.
	 */
	const estaRecolhida = (stageId: string, _quantidade: number) => collapsed.includes(stageId)

	/* Recolher virou só isto: liga e desliga. A exceção de "coluna vazia aberta
	 * na mão" existia para contornar o auto-recolhe que saiu junto. */
	const alternarColuna = (stageId: string, _quantidade: number) => {
		setCollapsed((atual) =>
			atual.includes(stageId) ? atual.filter((id) => id !== stageId) : [...atual, stageId],
		)
	}

	// `status: 'active'` escondia vaga pausada e arquivada, então procurar uma
	// vaga antiga no seletor simplesmente não achava. O board precisa de TODAS.
	const { data: jobsData, isLoading: loadingJobs } = empresa.useGetCompaniesJobs({
		limit: '200',
		status: 'all',
	})
	const jobs = jobsData?.data.jobs ?? []
	const job = jobs.find((j) => j.id === jobId)

	useEffect(() => {
		// sem vaga na URL, abre a primeira — mas gravando na URL, pra não ficar
		// um estado invisível que some ao recarregar
		if (!jobId && jobs.length > 0) setJobId(jobs[0].id)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [jobId, jobs])

	const { stages, configured } = usePipelineStages(jobId, t)

	/*
	 * Ordenação do board (V2-105).
	 *
	 * A API já aceitava `orderBy`/`orderDirection` e a UI fixava em nota — quem
	 * triava por ordem de chegada tinha que ler o board inteiro. A escolha vai na
	 * URL para sobreviver ao reload e ao compartilhamento do link.
	 */
	const order = ORDERS.find((item) => item.key === routeSearch.ordem) ?? ORDERS[0]

	// os MESMOS params vão para a query e para a chave do update otimista
	const boardParams = {
		limit: BOARD_LIMIT,
		orderBy: order.field,
		orderDirection: order.direction,
		/*
		 * O quadro precisa de TODO MUNDO no processo, não só de quem terminou.
		 *
		 * A rota tem o padrão `finished` porque é a mesma que a v1 usa há
		 * tempos, e lá candidato sem entrevista aparecia oferecendo
		 * "desbloquear por 1 crédito" — entrevista que não existe. Aqui a coluna
		 * "Candidatura" é justamente quem ainda não respondeu, então o pedido é
		 * explícito.
		 */
		finished: 'all' as const,
	}

	const { data, isLoading, isError, refetch, isFetching } =
		empresa.useGetCompaniesJobsJobIdCandidates(jobId, boardParams, {
			query: { enabled: Boolean(jobId) },
		})

	const payload = data?.data && 'candidates' in data.data ? data.data : null
	const allCards = useMemo(() => payload?.candidates.map(toPipelineCard) ?? [], [payload])
	/*
	 * Ranking (V2-904) é opt-in: sugestão ao lado do board, nunca a ordem
	 * imposta. Quem decide continua decidindo — a escolha de olhar é do
	 * recrutador.
	 */
	const [showRanking, setShowRanking] = useState(false)
	const candidateNames = useMemo(
		() => Object.fromEntries(allCards.map((card) => [card.id, card.name])),
		[allCards],
	)

	const { move, moveMany, stageLocally, pending, isMoving } = useMoveCandidate(jobId, boardParams)
	const [selected, setSelected] = useState<string[]>([])
	const [rejecting, setRejecting] = useState<{ ids: string[] } | null>(null)
	/** Reprovação aguardando a janela de desfazer — ainda não enviada. */
	const [pendingReject, setPendingReject] = useState<{
		ids: string[]
		payload: RejectionPayload
		undo: () => void
	} | null>(null)
	const [inviting, setInviting] = useState<{ ids: string[] } | null>(null)
	/*
	 * Convite = e-mail com o link da entrevista, que o Motor serve. Sem o
	 * plugin (edição open) todo caminho de convite geraria link morto — botão
	 * do header, atalho E, convite por cartão e a cobrança da fila.
	 */
	const { features } = useCapabilities()
	/** Ids em compartilhamento; `null` = diálogo fechado. */
	const [sharing, setSharing] = useState<string[] | null>(null)
	const [moveFailed, setMoveFailed] = useState(false)
	const [dragging, setDragging] = useState<PipelineCard | null>(null)

	const isStalled = (card: PipelineCard) =>
		card.inStageMs !== null && card.inStageMs / 86_400_000 >= STALLED_DAYS

	const stalledCount = allCards.filter(isStalled).length

	const cards = useMemo(() => {
		const term = search.trim().toLowerCase()
		const floor = minScore ? Number(minScore) : null
		return allCards
			.filter((card) => (onlyStalled ? isStalled(card) : true))
			.filter((card) => (onlyScored ? card.score !== null : true))
			.filter((card) => (floor !== null ? (card.score ?? -1) >= floor : true))
			.filter((card) =>
				term
					? card.name.toLowerCase().includes(term) ||
						(card.occupation ?? '').toLowerCase().includes(term)
					: true,
			)
	}, [allCards, onlyStalled, onlyScored, minScore, search])

	const filtered = cards.length !== allCards.length

	/** Etapas da régua + qualquer etapa órfã que o dado real trouxer. */
	const columns = useMemo(() => {
		const known = new Map<string, PipelineStageView>()
		for (const stage of stages) known.set(stage.id, stage)
		for (const card of allCards) {
			if (known.has(card.stage)) continue
			// etapa que existe no dado mas não na régua: aparece no fim, nunca some
			known.set(card.stage, {
				id: card.stage,
				order: 90 + known.size,
				label: card.stage,
				labelEn: card.stage,
				terminal: false,
				offTrack: false,
				canonical: false,
				fill: 'bg-data-done',
			})
		}
		return [...known.values()].sort((a, b) => a.order - b.order)
	}, [stages, allCards])

	const byStage = useMemo(() => {
		const map = new Map<string, PipelineCard[]>()
		for (const column of columns) map.set(column.id, [])
		for (const card of cards) map.get(card.stage)?.push(card)
		return map
	}, [columns, cards])

	/** Etapa de entrada: onde o botão "Convidar" faz sentido. */
	const entryStage = columns[0]?.id ?? 'applied'
	/*
	 * Quem terminou a entrevista NÃO entra em convite.
	 *
	 * A ficha de quem já entrevistou costuma continuar na etapa de entrada até
	 * alguém triar — então "Convidar todos" pegava esse candidato junto,
	 * mandava um e-mail pedindo a entrevista que ele já fez e ainda devolvia a
	 * ficha para "Entrevista IA", reiniciando o relógio da etapa. O servidor
	 * também recusa (`already_finished`), mas oferecer e depois ignorar é pior
	 * do que não oferecer.
	 */
	const convidaveisDaEntrada = (byStage.get(entryStage) ?? []).filter((c) => !c.finished)
	const invitableSelection = selected.filter((id) => {
		const card = allCards.find((c) => c.id === id)
		return card?.stage === entryStage && !card.finished
	})

	const sensors = useSensors(
		// distância evita que clique no card vire drag acidental
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		// teclado: espaço pega, setas movem, espaço solta (a11y de graça)
		useSensor(KeyboardSensor),
	)

	async function runMove(ids: string[], toStage: string, rejection?: RejectionPayload) {
		const ok =
			ids.length === 1
				? await move({ candidateId: ids[0], toStage, rejection })
				: await moveMany(ids, toStage, rejection)
		setMoveFailed(!ok)
		return ok
	}

	function requestMove(ids: string[], toStage: string) {
		// reprovar SEMPRE passa pelo modal: motivo tipado é obrigatório (TOS-018)
		if (toStage === 'rejected') {
			setRejecting({ ids })
			return
		}
		void runMove(ids, toStage)
		setSelected([])
	}

	function handleDragStart(event: DragStartEvent) {
		setDragging(allCards.find((c) => c.id === String(event.active.id)) ?? null)
	}

	function handleDragEnd(event: DragEndEvent) {
		setDragging(null)
		const candidateId = String(event.active.id)
		const toStage = event.over ? String(event.over.id) : null
		if (!toStage) return
		const card = allCards.find((c) => c.id === candidateId)
		if (!card || card.stage === toStage) return
		// arrastar um card de uma seleção move a seleção inteira
		const ids = selected.includes(candidateId) ? selected : [candidateId]
		/*
		 * A coluna que recebeu abre — mesmo se estava recolhida à mão.
		 *
		 * Só a derivação por "está vazia" não bastava: quem recolheu a coluna de
		 * propósito veria o cartão desaparecer numa régua de 44px, sem confirmação
		 * de que a movimentação valeu. Quem move alguém para uma etapa quer ver
		 * onde ele caiu.
		 */
		setCollapsed((atual) => atual.filter((id) => id !== toStage))
		requestMove(ids, toStage)
	}

	/**
	 * Reprovar com janela de desfazer.
	 *
	 * A reprovação NÃO é enviada durante os 8 segundos — só o cache muda, então o
	 * card sai da coluna imediatamente. É o que torna o undo honesto: reverter
	 * depois do envio não desfaria o e-mail que o candidato já recebeu.
	 */
	async function confirmRejection(payload: RejectionPayload) {
		const ids = rejecting?.ids ?? []
		if (ids.length === 0) return
		setRejecting(null)
		setSelected([])
		const undo = await stageLocally(ids, 'rejected')
		setPendingReject({ ids, payload, undo })
	}

	// Atalhos da barra de seleção (protótipo: M mover, E entrevista, R reprovar)
	useEffect(() => {
		if (selected.length === 0) return
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null
			if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
			if (e.key === 'Escape') setSelected([])
			if (e.key.toLowerCase() === 'r') setRejecting({ ids: selected })
			if (e.key.toLowerCase() === 'e' && invitableSelection.length > 0 && features.motor) {
				setInviting({ ids: invitableSelection })
			}
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	}, [selected, invitableSelection, features.motor])

	return (
		<div className='flex h-full flex-col'>
			{/* contexto da vaga no header: o board é SOBRE uma vaga, e o número que
			    importa é quantos estão parados */}
			<div className='flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-6'>
				<div className='min-w-0'>
					{/*
					 * Dentro da vaga, nome e identificador já estão no cabeçalho da
					 * página — repetir aqui empurrava o quadro para baixo e dava duas
					 * contagens lado a lado. Sobra o que só o quadro sabe: quantos
					 * estão nele agora e quantos estão parados.
					 */}
					{!embedded && <h1 className='text-[20px]'>{t('pipeline.title')}</h1>}
					<p className={cn('truncate text-[12.5px] text-text-2', !embedded && 'mt-1')}>
						{isLoading || loadingJobs ? (
							t('jobs.loading')
						) : (
							<>
								{!embedded && job?.jobName}
								{!embedded && job?.identifier && (
									<span className='font-num text-muted'> · {job.identifier}</span>
								)}
								<span className='text-muted'>
									{!embedded && ' · '}
									{filtered
										? t('pipeline.summaryFiltered', {
												count: cards.length,
												total: allCards.length,
											})
										: t('pipeline.summary', { count: allCards.length })}
								</span>
								{stalledCount > 0 && (
									<span className='text-amber'>
										{' · '}
										{t('pipeline.stalledCount', { count: stalledCount, days: STALLED_DAYS })}
									</span>
								)}
							</>
						)}
					</p>
				</div>

				<div className='flex flex-wrap items-center gap-2'>
					{!embedded && (
						<JobPicker
							jobs={jobs.map((j) => ({
								id: j.id,
								name: j.jobName,
								identifier: j.identifier,
								candidateCount: j.totalCandidates ?? null,
							}))}
							value={jobId}
							onChange={setJobId}
							loading={loadingJobs}
						/>
					)}
					<div className='flex h-8 w-[200px] items-center gap-2 rounded-lg border border-border bg-surface px-2.5'>
						<Search size={13} className='shrink-0 text-muted' />
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder={t('pipeline.searchCandidate')}
							className='w-full bg-transparent text-[12.5px] text-text outline-none placeholder:text-muted'
						/>
					</div>

					<ToggleChip active={onlyStalled} onClick={() => setOnlyStalled((v) => !v)}>
						<span className='inline-flex items-center gap-1.5'>
							<span
								className={cn(
									'h-1.5 w-1.5 rounded-full',
									onlyStalled ? 'bg-amber' : 'bg-data-track',
								)}
							/>
							{t('pipeline.onlyStalled')}
						</span>
					</ToggleChip>

					{features.motor && (
						<ToggleChip active={onlyScored} onClick={() => setOnlyScored((v) => !v)}>
							{t('pipeline.onlyScored')}
						</ToggleChip>
					)}

					{features.motor && (
						<ToggleChip active={showRanking} onClick={() => setShowRanking((v) => !v)}>
							{t('ranking.toggle')}
						</ToggleChip>
					)}

					{/* ordem do board: quem tria por chegada não precisa ler tudo */}
					<label className='inline-flex items-center gap-1.5 text-[12px] text-text-2'>
						<ArrowDownUp size={13} className='text-muted' />
						<select
							value={order.key}
							onChange={(event) => setOrder(event.target.value)}
							className='h-8 rounded-lg border border-border bg-surface px-2 text-[12.5px] text-text'
						>
							{ORDERS.filter((item) => features.motor || item.field !== 'score').map((item) => (
								<option key={item.key} value={item.key}>
									{t(`pipeline.order.${item.key}`)}
								</option>
							))}
						</select>
					</label>

					{features.motor && (
					<FilterPill
						label={t('pipeline.minScore')}
						value={minScore}
						defaultValue=''
						options={[
							{ value: '', label: t('pipeline.anyScore') },
							...['9', '8', '7', '6'].map((value) => ({
								value,
								label: t('pipeline.scoreAtLeast', { score: value }),
							})),
						]}
						onChange={setMinScore}
					/>
					)}
					{/* embutido, a aba Configuração está logo acima — o atalho virava eco */}
					{jobId && !embedded && (
						<Link
							to='/vagas/$jobId/configuracao'
							params={{ jobId }}
							className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
						>
							<Settings2 size={13} /> {t('pipeline.configureJob')}
						</Link>
					)}

					{/* ação primária da tela: a Coploy vive da entrevista */}
					{features.motor && (
						<Button
							disabled={!jobId || convidaveisDaEntrada.length === 0}
							onClick={() => setInviting({ ids: convidaveisDaEntrada.map((c) => c.id) })}
						>
							<Video size={14} /> {t('pipeline.inviteAll')}
						</Button>
					)}
				</div>
			</div>

			{isError && (
				<div className='mx-6 mb-3 flex items-center justify-between rounded-xl border border-border bg-danger-soft px-4 py-3 text-[13px] text-danger'>
					{t('pipeline.error')}
					<Button variant='secondary' size='sm' onClick={() => refetch()}>
						<RefreshCw size={12} /> {t('jobs.retry')}
					</Button>
				</div>
			)}

			{moveFailed && (
				<div className='mx-6 mb-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-danger-soft px-3 py-2 text-[12px] text-danger'>
					{t('pipeline.moveError')}
					<button onClick={() => setMoveFailed(false)} aria-label={t('filters.close')}>
						<X size={14} />
					</button>
				</div>
			)}

			{/* regra de adoção §7: vaga que nunca configurou merece convite */}
			{/*
			 * `key={jobId}`: o convite lê o "já dispensei" no primeiro render. Sem a
			 * key, o React reusa a instância ao trocar de vaga e o estado fica preso
			 * na vaga anterior — dispensar numa escondia o aviso em todas.
			 */}
			{!configured && jobId && !isLoading && (
				<AdoptionInvite key={jobId} jobId={jobId} className='mx-6 mb-3' />
			)}

			{/*
			 * Ranking acima do board, não dentro dele: o board é a ordem que o
			 * recrutador controla, e misturar a sugestão do modelo com as colunas
			 * confundiria as duas coisas.
			 */}
			{showRanking && jobId && (
				<div className='mx-6 mb-3'>
					<RankingPanel jobId={jobId} names={candidateNames} />
				</div>
			)}

			{!isError && (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCorners}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onDragCancel={() => setDragging(null)}
				>
					{/* faixa contínua: colunas coladas com border-right, sem raio e sem
					    gap — o board é UMA superfície, não uma fileira de cards */}
					<div
						className={cn(
							'flex min-h-0 flex-1 overflow-x-auto border-t border-border bg-bg transition-opacity duration-150',
							isFetching && 'opacity-60',
						)}
					>
						{columns.map((column) => (
							<PipelineColumn
								key={column.id}
								stage={column}
								jobId={jobId}
								columns={columns}
								cards={byStage.get(column.id) ?? []}
								collapsed={estaRecolhida(column.id, (byStage.get(column.id) ?? []).length)}
								loading={isLoading}
								selected={selected}
								pending={pending}
								isEntry={column.id === entryStage}
								onInvite={(id) => setInviting({ ids: [id] })}
								/*
								 * Cobrar a fila é o MESMO convite, em lote — reusa o modal que
								 * já existe, com a mensagem e o template da empresa. Criar um
								 * segundo caminho de envio significaria dois textos para o
								 * candidato e dois lugares para consertar.
								 */
								onRemindAll={(fila) => setInviting({ ids: fila.map((card) => card.id) })}
								onToggleSelect={(id) =>
									setSelected((current) =>
										current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
									)
								}
								onMove={(id, toStage) => requestMove([id], toStage)}
								onToggle={() =>
									alternarColuna(column.id, (byStage.get(column.id) ?? []).length)
								}
							/>
						))}
					</div>

					{/* O card arrastado vive num portal: dentro da coluna ele era
					    recortado pelo `overflow-y-auto` e sumia atrás das vizinhas. */}
					<DragOverlay dropAnimation={null}>
						{dragging && (
							<div className='w-[266px] rotate-2 rounded-[10px] border border-lime bg-card p-2.5 shadow-[var(--shadow-pop)]'>
								<div className='flex items-center gap-2'>
									<span className='flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-card-alt text-[10.5px] font-semibold text-text-2'>
										{dragging.name.slice(0, 2).toUpperCase()}
									</span>
									<span className='min-w-0 flex-1 truncate text-[12.5px] font-medium'>
										{dragging.name}
									</span>
								</div>
							</div>
						)}
					</DragOverlay>
				</DndContext>
			)}

			{/* barra de ação em massa no RODAPÉ, como no protótipo — o board fica
			    inteiro visível e as ações caem perto da mão */}
			{selected.length > 0 && (
				<div className='flex flex-wrap items-center gap-2 border-t border-border bg-surface px-6 py-2.5'>
					<span className='inline-flex items-center gap-2 text-[12.5px] font-medium'>
						<span className='font-num rounded-md bg-lime px-[7px] py-px text-lime-ink'>
							{selected.length}
						</span>
						{t('pipeline.selectedSuffix')}
					</span>
					<span className='mx-1 h-5 w-px bg-border' />

					<MoveMenuBulk columns={columns} onMove={(stage) => requestMove(selected, stage)} />

					{features.motor && (
						<Button
							variant='secondary'
							size='sm'
							disabled={invitableSelection.length === 0 || isMoving}
							onClick={() => setInviting({ ids: invitableSelection })}
						>
							<Video size={12} /> {t('pipeline.inviteSelected')} <Kbd>E</Kbd>
						</Button>
					)}
					<Button
						variant='secondary'
						size='sm'
						disabled={isMoving}
						onClick={() => setRejecting({ ids: selected })}
					>
						{t('reject.confirm')} <Kbd>R</Kbd>
					</Button>
					{/*
					 * Compartilhar com quem decide junto. A v1 tinha e o ATS não —
					 * o backend já existia inteiro, faltava a porta.
					 */}
					{/*
					 * O compartilhamento pede ID DE USUÁRIO, não de entrevista.
					 *
					 * `selected` guarda o id do cartão (a entrevista), que é o certo para
					 * mover, convidar e reprovar — e o errado aqui. Mandando entrevista,
					 * o link nascia apontando para ninguém e o destinatário via "nenhum
					 * candidato encontrado". Quem não tem `userId` fica de fora: sem ele
					 * não há o que compartilhar.
					 */}
					<Button
						variant='secondary'
						size='sm'
						onClick={() =>
							setSharing(
								cards
									.filter((card) => selected.includes(card.id) && card.userId)
									.map((card) => card.userId as string),
							)
						}
					>
						<Share2 size={12} /> {t('share.action')}
					</Button>

					<button
						onClick={() => setSelected([])}
						className='ml-auto inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-text'
					>
						{t('pipeline.clearSelection')} <Kbd>esc</Kbd>
					</button>
				</div>
			)}

			{pendingReject && (
				<UndoToast
					message={t('pipeline.rejectPending', { count: pendingReject.ids.length })}
					onCommit={() => {
						void runMove(pendingReject.ids, 'rejected', pendingReject.payload)
					}}
					onUndo={pendingReject.undo}
					onClose={() => setPendingReject(null)}
				/>
			)}

			<RejectionModal
				open={rejecting !== null}
				count={rejecting?.ids.length ?? 0}
				submitting={isMoving}
				onCancel={() => setRejecting(null)}
				onConfirm={(payload) => void confirmRejection(payload)}
			/>

			<InviteModal
				open={inviting !== null}
				jobId={jobId}
				candidateIds={inviting?.ids ?? []}
				onClose={() => {
					setInviting(null)
					setSelected([])
				}}
			/>

			{sharing && sharing.length > 0 && (
				<ShareDialog
					jobId={jobId}
					candidateIds={sharing}
					onClose={() => setSharing(null)}
				/>
			)}
		</div>
	)
}

function PipelineColumn({
	stage,
	jobId,
	columns,
	cards,
	collapsed,
	loading,
	selected,
	pending,
	isEntry,
	onInvite,
	onRemindAll,
	onToggleSelect,
	onMove,
	onToggle,
}: {
	stage: PipelineStageView
	jobId: string
	columns: PipelineStageView[]
	cards: PipelineCard[]
	collapsed: boolean
	loading: boolean
	selected: string[]
	pending: Set<string>
	isEntry: boolean
	onInvite: (id: string) => void
	/** Cobra a fila inteira de uma vez — a única ação que a coluna de espera pede. */
	onRemindAll: (cards: PipelineCard[]) => void
	onToggleSelect: (id: string) => void
	onMove: (id: string, toStage: string) => void
	onToggle: () => void
}) {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	// a coluna INTEIRA é alvo de drop, inclusive o vazio — soltar em coluna
	// vazia é o caso mais comum de mover pra frente
	const { setNodeRef, isOver } = useDroppable({ id: stage.id })

	/*
	 * Etapas onde o relógio é do CANDIDATO. Abaixo do limiar a lista cabe na
	 * tela e o resumo só atrapalharia.
	 */
	const ehFila = stage.id === 'applied' || stage.id === 'pending'
	const [filaAberta, setFilaAberta] = useState(false)

	/*
	 * Recolhida CONTINUA recolhida durante o arraste — e abre depois do drop.
	 *
	 * A tentativa anterior expandia a coluna enquanto o cartão passava por cima.
	 * Parecia melhor e quebrava o drop: trocar `<div>` por `<section>` no meio
	 * do arraste reassocia o `setNodeRef` a um nó novo, cuja medida o dnd-kit
	 * tirou no início do gesto e não refaz — e a expansão empurra todas as
	 * colunas seguintes, movendo o alvo debaixo do ponteiro. O cartão não caía
	 * em lugar nenhum.
	 *
	 * A régua fica de 44px, mas se anuncia como alvo: matiz da marca, borda
	 * acesa e a seta virada para dentro. Quem solta acerta, e a coluna abre em
	 * seguida porque deixou de estar vazia.
	 */
	if (collapsed) {
		return (
			<div
				ref={setNodeRef}
				className={cn(
					'flex w-11 shrink-0 flex-col items-center gap-3 border-r py-3 transition-colors',
					isOver ? 'border-lime-mid bg-lime-soft' : 'border-border',
				)}
			>
				<button
					onClick={onToggle}
					className={cn(
						'transition-colors hover:text-text',
						isOver ? 'text-lime-fg' : 'text-muted',
					)}
					aria-label={t('pipeline.expandColumn', { stage: stage.label })}
				>
					{isOver ? <ArrowDownToLine size={13} /> : <ChevronRight size={13} />}
				</button>
				<span className={cn('h-1.5 w-1.5 rounded-full', stage.fill)} />
				<span className={cn('font-num text-[11px]', isOver ? 'text-lime-fg' : 'text-muted')}>
					{cards.length}
				</span>
				<span
					className={cn(
						'mt-1 whitespace-nowrap text-[12px]',
						isOver ? 'font-medium text-lime-fg' : 'text-text-2',
					)}
					style={{ writingMode: 'vertical-rl' }}
				>
					{stage.label}
				</span>
			</div>
		)
	}

	return (
		<section
			ref={setNodeRef}
			className={cn(
				'flex w-[290px] shrink-0 flex-col border-r border-border transition-colors',
				// a etapa de Entrevista IA é a assinatura do produto: fica acesa
				stage.id === 'pending' ? 'bg-lime-soft/40' : 'bg-card',
				isOver && 'bg-lime-soft',
			)}
		>
			<header className='flex h-10 shrink-0 items-center gap-2 border-b border-border px-3'>
				<span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', stage.fill)} />
				<h2 className='flex-1 truncate text-[12px] font-medium'>{stage.label}</h2>
				<span className='font-num text-[11px] text-muted'>{cards.length}</span>
				<button
					onClick={onToggle}
					className='text-muted transition-colors hover:text-text'
					aria-label={t('pipeline.collapseColumn', { stage: stage.label })}
				>
					<ChevronLeft size={13} />
				</button>
			</header>

			<div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5'>
				{loading &&
					Array.from({ length: 3 }, (_, i) => (
						<div key={i} className='h-[92px] animate-pulse rounded-[10px] bg-card-alt' />
					))}
				{!loading && cards.length === 0 && (
					<p className='px-2 py-6 text-center text-[12px] text-muted'>{t('pipeline.emptyColumn')}</p>
				)}

				{/*
				 * Fila, não pilha.
				 *
				 * Candidatura e Entrevista IA esperam o CANDIDATO agir; o resto do
				 * quadro espera VOCÊ decidir. Com 300 inscritos, ler 300 cartões numa
				 * coluna onde não há decisão a tomar é o caminho para não olhar
				 * nenhuma. Aqui a coluna responde "quantos" e oferece a única ação que
				 * faz sentido — cobrar —, com a lista atrás de um clique para quem
				 * quiser conferir.
				 *
				 * O limiar existe porque com cinco pessoas o resumo é pior que a
				 * lista: esconderia o que cabia na tela.
				 */}
				{!loading && ehFila && cards.length > LIMIAR_DE_FILA && !filaAberta && (
					<div className='rounded-[10px] border border-border bg-card p-3.5 text-center'>
						<p className='font-num text-[28px] font-semibold leading-none'>{cards.length}</p>
						<p className='mt-1 text-[12px] leading-snug text-text-2'>
							{t(`pipeline.queue.${stage.id === 'applied' ? 'applied' : 'pending'}`)}
						</p>

						{/* cobrar = reenviar o link da entrevista; sem Motor seria link morto */}
						{features.motor && (
							<button
								onClick={() => onRemindAll(cards)}
								className='mt-3 w-full rounded-lg bg-lime px-3 py-1.5 text-[12px] font-medium text-lime-ink transition-[filter] hover:brightness-95'
							>
								{t('pipeline.queue.remindAll')}
							</button>
						)}
						<button
							onClick={() => setFilaAberta(true)}
							className='mt-2 w-full text-[11.5px] text-muted transition-colors hover:text-text'
						>
							{t('pipeline.queue.showList')}
						</button>
					</div>
				)}

				{ehFila && filaAberta && cards.length > LIMIAR_DE_FILA && (
					<button
						onClick={() => setFilaAberta(false)}
						className='mb-1 text-[11.5px] text-muted transition-colors hover:text-text'
					>
						{t('pipeline.queue.hideList')}
					</button>
				)}

				{(!ehFila || cards.length <= LIMIAR_DE_FILA || filaAberta) &&
					cards.map((card) => (
					<CandidateCard
						key={card.id}
						card={card}
						jobId={jobId}
						columns={columns}
						selected={selected.includes(card.id)}
						moving={pending.has(card.id)}
						showInvite={isEntry && features.motor && !card.finished}
						showInterviewState={features.motor}
						onInvite={() => onInvite(card.id)}
						onToggleSelect={() => onToggleSelect(card.id)}
						onMove={(toStage) => onMove(card.id, toStage)}
					/>
				))}
			</div>
		</section>
	)
}

/**
 * Trilha do candidato: onde ele está no processo INTEIRO, com os segmentos
 * proporcionais ao TEMPO em cada etapa. É a assinatura da casa
 * (design-fundacao §3.5) na escala do card.
 *
 * Sem histórico por etapa, o único tempo real que temos é o da etapa atual
 * (`dateSelect`) contra o total no processo. Então: as etapas cumpridas
 * dividem o tempo anterior por igual e a atual ganha a fatia que de fato
 * ocupou — mentir menos vale mais do que fingir precisão.
 */
function candidateTrail(card: PipelineCard, columns: PipelineStageView[]) {
	const track = columns.filter((c) => !c.offTrack)
	const currentIndex = track.findIndex((c) => c.id === card.stage)
	if (currentIndex === -1) {
		return track.map((column) => ({ id: column.id, flex: 1, state: 'pending' as const }))
	}

	const total = Math.max(card.inProcessMs ?? 0, 1)
	const inStage = card.inStageMs ?? 0
	const before = Math.max(total - inStage, 0)
	const perDone = currentIndex > 0 ? before / currentIndex : 0
	// piso pra etapa nenhuma virar um fio invisível
	const MIN = 0.35

	return track.map((column, index) => ({
		id: column.id,
		flex:
			index < currentIndex
				? Math.max(perDone / total, MIN)
				: index === currentIndex
					? Math.max(inStage / total, MIN)
					: MIN,
		state:
			index < currentIndex
				? ('done' as const)
				: index === currentIndex
					? ('current' as const)
					: ('pending' as const),
	}))
}

function CandidateCard({
	card,
	jobId,
	columns,
	selected,
	moving,
	showInvite,
	showInterviewState,
	onInvite,
	onToggleSelect,
	onMove,
}: {
	card: PipelineCard
	jobId: string
	columns: PipelineStageView[]
	selected: boolean
	moving: boolean
	showInvite: boolean
	/** Sem Motor, "não iniciou/parou na 3ª" é vocabulário de coisa que não existe. */
	showInterviewState: boolean
	onInvite: () => void
	onToggleSelect: () => void
	onMove: (toStage: string) => void
}) {
	const { t } = useTranslation()
	const stalledDays = card.inStageMs === null ? null : card.inStageMs / 86_400_000
	const stalled = stalledDays !== null && stalledDays >= STALLED_DAYS
	const highScore = card.score !== null && card.score >= HIGH_SCORE
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
	const trail = candidateTrail(card, columns)
	/*
	 * Registro incompleto tem outra superfície.
	 *
	 * O selo "Entrevista pendente" no rodapé só é lido por quem já parou no
	 * cartão — e numa coluna de 300 ninguém para em cada um. Borda tracejada e
	 * fundo recuado dizem "ainda é rascunho" na varredura, antes da leitura: é
	 * a diferença entre uma ficha e uma ficha por preencher.
	 *
	 * Vale só nas etapas onde a entrevista ainda é esperada. Em reprovado e
	 * contratado a entrevista deixou de ser o assunto, e tracejar metade do
	 * quadro transformaria o sinal em textura.
	 */
	const aguardaEntrevista =
		!card.finished && (card.stage === 'applied' || card.stage === 'pending')

	return (
		<article
			ref={setNodeRef}
			className={cn(
				'group rounded-[10px] border p-2.5 transition-all duration-150',
				aguardaEntrevista ? 'border-dashed bg-card-alt/60' : 'bg-card',
				'hover:border-lime-mid hover:shadow-[var(--shadow-pop)]',
				selected ? 'border-lime shadow-[var(--shadow-pop)]' : 'border-border',
				// o original vira fantasma; quem viaja com o mouse é o DragOverlay
				isDragging && 'opacity-30',
				moving && 'pointer-events-none opacity-50',
			)}
		>
			<div className='flex items-start gap-2'>
				{/* o checkbox OCUPA o lugar do avatar no hover, mesmo diâmetro — é o
				    padrão do Gmail/Linear e evita sobrepor a foto ou deslocar texto */}
				<div className='relative h-[26px] w-[26px] shrink-0'>
					<span
						className={cn(
							'absolute inset-0 transition-opacity',
							selected ? 'opacity-0' : 'group-hover:opacity-0',
						)}
					>
						{card.photoUrl ? (
							<img
								src={card.photoUrl}
								alt=''
								loading='lazy'
								width={26}
								height={26}
								className='h-[26px] w-[26px] rounded-full object-cover'
							/>
						) : (
							<span className='flex h-[26px] w-[26px] items-center justify-center rounded-full bg-card-alt text-[10.5px] font-semibold text-text-2'>
								{card.name.slice(0, 2).toUpperCase()}
							</span>
						)}
					</span>
					<label
						className={cn(
							'absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-card-alt transition-opacity',
							selected
								? 'opacity-100'
								: 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
						)}
					>
						<input
							type='checkbox'
							checked={selected}
							onChange={onToggleSelect}
							aria-label={t('pipeline.select', { name: card.name })}
							className='h-3.5 w-3.5 accent-[var(--lime)]'
						/>
					</label>
				</div>

				{/* alça de arraste: só o bloco de texto. Deixar os controles fora dela
				    evita que clicar no checkbox ou no menu comece um drag. */}
				<div
					{...listeners}
					{...attributes}
					className='min-w-0 flex-1 cursor-grab active:cursor-grabbing'
				>
					{/* o nome é link pro dossiê; o resto do bloco continua sendo alça
					    de arraste, então ler e mover não competem pelo mesmo gesto */}
					<Link
						to='/vagas/$jobId/candidatos/$candidateId'
						params={{ jobId, candidateId: card.id }}
						onPointerDown={(e) => e.stopPropagation()}
						className='block truncate text-[12.5px] font-medium leading-tight text-text transition-colors duration-150 hover:underline group-hover:text-lime-fg'
					>
						{card.name}
					</Link>
					{card.occupation && <p className='truncate text-[11px] text-muted'>{card.occupation}</p>}
				</div>

				{/*
				 * Bloqueado por crédito ≠ sem nota. Antes os dois viravam a mesma
				 * ausência no card e o recrutador não sabia se esperava o
				 * processamento ou se precisava desbloquear.
				 */}
				{card.locked && (
					<Tooltip side='top' label={t('pipeline.lockedHint')}>
						<span className='inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-px text-[11px] text-muted'>
							<Lock size={10} />
						</span>
					</Tooltip>
				)}

				{/* autenticidade só aparece quando é sinal de dúvida — celebrar
				    "autêntico" em todo card viraria ruído */}
				{card.authenticity !== null && card.authenticity < 6 && (
					<Tooltip
						side='top'
						label={t('pipeline.authenticityHint', {
							percent: Math.round(card.authenticity * 10),
						})}
					>
						<span className='inline-flex shrink-0 items-center gap-1 rounded-md border border-amber/50 px-1.5 py-px text-[11px] text-amber'>
							<ShieldQuestion size={10} />
						</span>
					</Tooltip>
				)}

				{/*
				 * Nota só de entrevista CONCLUÍDA.
				 *
				 * Zero é nota — mas só depois de responder. Em quem nem começou, o
				 * mesmo zero significa "não avaliado", e o cartão mostrava "0,0" ao
				 * lado de "Não iniciou": dois fatos contraditórios na mesma linha.
				 */}
				{card.finished && card.score !== null && (
					<Tooltip side='top' label={t('pipeline.scoreLabel')}>
						<span
							className={cn(
								'font-num shrink-0 rounded-md border px-1.5 py-px text-[12px] font-medium',
								highScore ? 'border-lime-mid text-lime-fg' : 'border-border text-text-2',
							)}
						>
							{card.score.toFixed(1).replace('.', ',')}
						</span>
					</Tooltip>
				)}

				{/* slot próprio, sempre reservado: some no repouso mas o espaço fica,
				    então nada pula quando o mouse entra */}
				<MoveMenu card={card} columns={columns} onMove={onMove} />
			</div>

			<div className='mt-2.5 flex items-center gap-px'>
				{trail.map((segment) => (
					<span
						key={segment.id}
						style={{ flex: segment.flex }}
						className={cn(
							'h-[3px] rounded-[1px]',
							segment.state === 'done'
								? 'bg-data-done'
								: segment.state === 'current'
									? stalled
										? 'bg-amber'
										: 'bg-lime'
									: 'bg-data-track',
						)}
					/>
				))}
				<span
					className={cn(
						'ml-0.5 h-[5px] w-[5px] shrink-0 rounded-full',
						stalled ? 'bg-amber' : 'bg-lime',
					)}
				/>
			</div>

			<div className='mt-2 flex items-center gap-2 text-[11px]'>
				{/* "no processo" = desde a candidatura; o dot conta a etapa parada */}
				<Tooltip
					side='bottom'
					label={
						stalled
							? t('pipeline.stuckHint', { days: STALLED_DAYS })
							: t('pipeline.inStageHint', { duration: formatDuration(card.inStageMs ?? 0) })
					}
				>
					<span
						className={cn(
							'font-num inline-flex items-center gap-1.5',
							stalled ? 'font-medium text-amber' : 'text-muted',
						)}
					>
						<span
							className={cn(
								'inline-block h-[5px] w-[5px] rounded-full',
								stalled ? 'animate-pulse bg-amber' : 'bg-data-track',
							)}
						/>
						{/* etapa terminal: a jornada acabou — relógio contando lê como pendência */}
						{card.inProcessMs === null || columns.find((c) => c.id === card.stage)?.terminal
							? '—'
							: t('pipeline.inProcess', { duration: formatDuration(card.inProcessMs) })}
					</span>
				</Tooltip>

				{showInvite ? (
					// na etapa de entrada a ação óbvia é convidar — sem menu no meio
					<button
						onClick={onInvite}
						className='ml-auto inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10.5px] text-text-2 transition-colors hover:border-lime-mid hover:text-lime-fg'
					>
						<Video size={10} /> {t('pipeline.invite')}
					</button>
				) : (
					/*
					 * Três estados, não dois.
					 *
					 * "Entrevista pendente" cobria tanto quem nunca abriu o link quanto
					 * quem parou na terceira pergunta — e a ação certa é diferente:
					 * convidar de novo vs. lembrar de terminar. Sem separar, o
					 * recrutador não sabe qual dos dois está olhando.
					 */
					showInterviewState && !card.finished && (
						<span
							className={cn(
								'ml-auto rounded px-1.5 py-0.5 text-[10.5px]',
								card.answeredCount ? 'bg-lime-soft text-lime-fg' : 'bg-card-alt text-text-2',
							)}
						>
							{/*
							 * Três estados. `null` (candidatura anterior ao espelhamento do
							 * contador) cai no texto neutro: dizer "não iniciou" para quem
							 * parou na terceira pergunta manda cobrar quem já está no meio
							 * do caminho.
							 */}
							{card.answeredCount === null
								? t('pipeline.notFinished')
								: card.answeredCount > 0
									? t('pipeline.interviewStarted', { count: card.answeredCount })
									: t('pipeline.interviewNotStarted')}
						</span>
					)
				)}
			</div>
		</article>
	)
}

/** Popover que fecha em clique fora — sem engolir o clique no próprio item. */
function useDismissable() {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
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

	return { open, setOpen, ref }
}

/**
 * Mover em ≤2 cliques (aceite do TOS-029): abre e escolhe a etapa. Existe
 * porque drag & drop não é acessível por teclado em todo host e falha em
 * telas estreitas — o menu é o caminho garantido, o drag é o atalho.
 */
function MoveMenu({
	card,
	columns,
	onMove,
}: {
	card: PipelineCard
	columns: PipelineStageView[]
	onMove: (toStage: string) => void
}) {
	const { t } = useTranslation()
	const { open, setOpen, ref } = useDismissable()
	const targets = columns.filter((column) => column.id !== card.stage)

	return (
		<div ref={ref} className='relative z-20 shrink-0'>
			<button
				onClick={() => setOpen((v) => !v)}
				aria-label={t('pipeline.moveTo')}
				className={cn(
					'rounded-md border border-border bg-card p-1 text-muted transition-all hover:border-lime-mid hover:text-text',
					open ? 'opacity-100' : 'opacity-0 focus:opacity-100 group-hover:opacity-100',
				)}
			>
				<MoveRight size={12} />
			</button>

			{open && (
				<div className='absolute right-0 top-7 w-44 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-[var(--shadow-pop)]'>
					<p className='px-2.5 py-1 text-[10px] uppercase tracking-wide text-muted'>
						{t('pipeline.moveTo')}
					</p>
					{targets.map((column) => (
						<button
							key={column.id}
							onClick={() => {
								onMove(column.id)
								setOpen(false)
							}}
							className='flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-hover'
						>
							<span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', column.fill)} />
							<span className='truncate'>{column.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	)
}

function MoveMenuBulk({
	columns,
	onMove,
}: {
	columns: PipelineStageView[]
	onMove: (toStage: string) => void
}) {
	const { t } = useTranslation()
	const { open, setOpen, ref } = useDismissable()

	return (
		<div ref={ref} className='relative'>
			<Button variant='secondary' size='sm' onClick={() => setOpen((v) => !v)}>
				<MoveRight size={12} /> {t('pipeline.moveStage')} <Kbd>M</Kbd>
			</Button>
			{open && (
				<div className='absolute bottom-9 left-0 z-40 w-48 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-[var(--shadow-pop)]'>
					{columns.map((column) => (
						<button
							key={column.id}
							onClick={() => {
								onMove(column.id)
								setOpen(false)
							}}
							className='flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-hover'
						>
							<span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', column.fill)} />
							<span className='truncate'>{column.label}</span>
						</button>
					))}
				</div>
			)}
		</div>
	)
}
