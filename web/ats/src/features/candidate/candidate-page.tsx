import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, BadgeCheck, FileText, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { MotorNotice } from '@/components/motor-notice'
import { RejectionModal, type RejectionPayload } from '@/features/pipeline/rejection-modal'
import { useMoveCandidate } from '@/features/pipeline/use-move-candidate'
import { usePipelineStages } from '@/features/pipeline/use-pipeline-stages'
import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Skeleton, SkeletonCard } from '@/ui/skeleton'
import { Button } from '@/ui/button'
import { Card } from '@/ui/page'

import { ContactActions } from './contact-row'
import { ProfileRequestCard } from './profile-request-card'
import { OfferPanel } from './offer-panel'
import { ScorecardPanel } from './scorecard-panel'
import { TimelinePanel } from './timeline-panel'
import { InterviewPanel } from './interview-panel'
import { InterviewBadges } from './interview-badges'
import { UnlockCard } from './unlock-card'
import { RequireCapability } from '@/components/require-capability'
import { PeerNav, usePeers } from './peer-nav'
import { InviteModal } from '@/features/pipeline/invite-modal'
import { ProcessTrail, buildTrail } from './process-trail'

/**
 * Detalhe do candidato numa vaga.
 *
 * A tela responde UMA pergunta: essa pessoa avança ou não? Por isso as ações
 * ficam no header (onde a decisão acontece) e tudo abaixo é evidência —
 * trilha, trajetória, entrevista. Nada aqui é "informação de cadastro".
 */
export function CandidatePage() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { jobId, candidateId } = useParams({
		from: '/app/vagas/$jobId/candidatos/$candidateId',
	})

	const { data, isLoading, isError } = empresa.useGetCompaniesJobsJobIdCandidatesCandidateIdDossier(
		jobId,
		candidateId,
	)
	const dossier = data?.data
	const { stages } = usePipelineStages(jobId, t)
	const { move, isMoving } = useMoveCandidate(jobId)
	const peers = usePeers(jobId, candidateId)
	const [rejecting, setRejecting] = useState(false)
	/* cobrar quem não respondeu — mesmo modal e mesmo template do convite */
	const [inviting, setInviting] = useState(false)
	/**
	 * Idioma cuja tradução foi pedida ao core.
	 *
	 * A rota é cache-aware: se já existe, volta na hora; se não, gera uma vez e
	 * guarda. Por isso a tela pode pedir sem medo de custo repetido.
	 */
	const [translating, setTranslating] = useState<string | null>(null)
	const queryClient = useQueryClient()
	const { features } = useCapabilities()
	/**
	 * Header completo é privilégio de tela alta.
	 *
	 * Ele custa ~430px: num notebook 1366×768 sobrava menos de um terço da tela
	 * para a entrevista, que é o conteúdo. Em vez de encolher ao rolar (o header
	 * mexendo enquanto se lê é pior que header grande), a versão completa só
	 * existe onde há altura sobrando; abaixo disso a tela abre direto na versão
	 * de uma linha e fica estável.
	 */
	const [roomy, setRoomy] = useState(
		() => typeof window !== 'undefined' && window.matchMedia('(min-height: 900px)').matches,
	)

	useEffect(() => {
		const query = window.matchMedia('(min-height: 900px)')
		const sync = (event: MediaQueryListEvent | MediaQueryList) => setRoomy(event.matches)
		query.addEventListener('change', sync)
		return () => query.removeEventListener('change', sync)
	}, [])

	const compact = !roomy

	const trail = useMemo(() => {
		if (!dossier) return []
		return buildTrail(
			stages,
			dossier.application.stage,
			dossier.trail.daysInProcess,
			dossier.trail.daysInStage,
			t,
		)
	}, [dossier, stages, t])

	/** Próxima etapa da régua: é ela que o botão primário empurra. */
	const nextStage = useMemo(() => {
		const track = stages.filter((stage) => !stage.offTrack)
		const index = track.findIndex((stage) => stage.id === dossier?.application.stage)
		return index >= 0 && index < track.length - 1 ? track[index + 1] : null
	}, [stages, dossier])

	if (isLoading) {
		/*
		 * Esqueleto no formato REAL da tela (cabeçalho + duas colunas), não um
		 * spinner no meio do nada: o dossiê é a tela mais pesada do ATS, e ver o
		 * layout se montar no lugar certo é o que evita o salto quando o dado
		 * chega.
		 */
		return (
			<div className='flex h-full min-h-0 flex-col'>
				<div className='shrink-0 border-b border-border px-4 py-4'>
					<div className='flex items-center gap-3'>
						<Skeleton className='h-12 w-12 rounded-full' />
						<div className='flex flex-col gap-2'>
							<Skeleton className='h-4 w-40' />
							<Skeleton className='h-3 w-24' />
						</div>
					</div>
					<Skeleton className='mt-4 h-2 w-full' />
				</div>
				<div className='grid min-h-0 flex-1 gap-3 overflow-hidden p-4 xl:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)]'>
					<div className='flex flex-col gap-4'>
						<SkeletonCard lines={5} />
						<SkeletonCard lines={2} />
					</div>
					<div className='flex flex-col gap-4'>
						<SkeletonCard lines={2} />
						<SkeletonCard lines={6} />
					</div>
				</div>
			</div>
		)
	}

	if (isError || !dossier) {
		return (
			<div className='flex h-full flex-col items-center justify-center gap-2 text-center'>
				<p className='text-[13px]'>{t('candidate.error')}</p>
				<Link
					to='/pipeline'
					search={{ vaga: jobId }}
					className='text-[12px] text-lime-fg hover:underline'
				>
					{t('candidate.backToPipeline')}
				</Link>
			</div>
		)
	}

	const { candidate, interview, benchmark } = dossier
	/*
	 * Concluída, não "tem documento de entrevista".
	 *
	 * `interview` passa a existir na hora em que o candidato abre o link — o
	 * documento nasce com uma entrada por pergunta, todas vazias. Usar a
	 * existência dele como gate mostrava nota "—/10" e formulário de avaliação
	 * para quem não respondeu nada.
	 */
	const concluida = dossier.application.finished
	/**
	 * `job` só existe a partir do contrato 0.16. Cliente novo contra core
	 * antigo é o estado NORMAL entre um deploy e outro — sem o fallback a tela
	 * inteira quebra em "Cannot read properties of undefined".
	 */
	const jobKnown = Boolean(dossier.job)
	const job = dossier.job ?? {
		typeInterview: null,
		interviewMode: null,
		language: null,
		description: null,
		requirements: null,
		responsibilities: null,
		level: null,
		model: null,
		contractType: null,
		mainSkills: null,
		screeningObjective: null,
	}
	/**
	 * A coluna do perfil aparece SEMPRE.
	 *
	 * Escondê-la quando não há dado fazia dois candidatos da mesma vaga terem
	 * telas diferentes — quem não preencheu simplesmente não tinha coluna, e o
	 * recrutador não sabia se faltava dado ou se a tela era assim. Agora o vazio
	 * é explícito e vem com a saída: pedir o cadastro ao candidato.
	 */
	const hasProfile =
		candidate.experiences.length > 0 ||
		candidate.education.length > 0 ||
		candidate.languages.length > 0 ||
		dossier.skills.length > 0 ||
		Boolean(candidate.summary)

	async function requestTranslation(language: string) {
		const userId = dossier?.candidate.id
		const jobAppliedId = dossier?.application.jobAppliedId
		if (!userId || !jobAppliedId) return
		setTranslating(language)
		try {
			await empresa.getCompaniesInterviewsUserIdJobAppliedIdTranslationLanguage(
				userId,
				jobAppliedId,
				language,
			)
			// o dossiê é quem serve os blocos traduzidos; recarrega com o cache quente
			await queryClient.invalidateQueries()
		} finally {
			setTranslating(null)
		}
	}

	async function advance() {
		if (!nextStage) return
		await move({ candidateId, toStage: nextStage.id })
		navigate({ to: '/pipeline', search: { vaga: jobId } })
	}

	async function confirmRejection(payload: RejectionPayload) {
		const ok = await move({
			candidateId,
			toStage: 'rejected',
			rejection: payload,
		})
		if (!ok) return
		setRejecting(false)
		navigate({ to: '/pipeline', search: { vaga: jobId } })
	}

	return (
		/*
		 * O scroll é do CONTEÚDO, não da página.
		 *
		 * Com a página inteira rolando, identidade, trilha e fila saíam de vista
		 * assim que o recrutador começava a ler as respostas — e é justamente aí
		 * que ele precisa lembrar quem está avaliando e em que etapa.
		 */
		<div className='flex h-full min-h-0 flex-col'>
			<div
				className={cn(
					'shrink-0 border-b border-border bg-surface px-4 transition-all',
					compact ? 'pb-2 pt-2' : 'pb-3 pt-4',
				)}
			>
				{/*
				 * A vaga fica na primeira linha, não escondida num card lá embaixo:
				 * quem abre o candidato precisa saber PRA QUÊ está avaliando antes de
				 * ler a primeira resposta. Voltar leva ao board já filtrado nela.
				 */}
				<div
					className={cn(
						'flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]',
						compact ? 'hidden' : 'mb-3',
					)}
				>
					<Link
						to='/pipeline'
						search={{ vaga: jobId }}
						className='inline-flex items-center gap-1.5 text-muted transition-colors hover:text-text'
					>
						<ArrowLeft size={13} /> {t('candidate.backToPipeline')}
					</Link>
					{dossier.application.jobName && (
						<>
							<span className='text-border'>/</span>
							<Link
								to='/vagas/$jobId/configuracao'
								params={{ jobId }}
								className='font-medium text-text-2 transition-colors hover:text-text'
							>
								{dossier.application.jobName}
							</Link>
						</>
					)}
					{[job.level, job.model, job.contractType].filter(Boolean).map((tag) => (
						<span key={String(tag)} className='text-[11.5px] text-muted'>
							· {String(tag)}
						</span>
					))}
				</div>

				<div className='flex flex-wrap items-start justify-between gap-4'>
					<div className='flex min-w-0 items-start gap-3'>
						{candidate.photoUrl ? (
							<img
								src={candidate.photoUrl}
								alt=''
								className={cn(
									'shrink-0 rounded-xl object-cover transition-all',
									compact ? 'h-8 w-8' : 'h-[52px] w-[52px]',
								)}
							/>
						) : (
							<span
								className={cn(
									'font-display flex shrink-0 items-center justify-center rounded-xl bg-lime-soft font-semibold text-lime-fg',
									compact ? 'h-8 w-8 text-[12px]' : 'h-[52px] w-[52px] text-[18px]',
								)}
							>
								{candidate.name.slice(0, 2).toUpperCase()}
							</span>
						)}

						<div className='min-w-0'>
							<div className='flex flex-wrap items-center gap-2'>
								<h1 className={cn('truncate transition-all', compact ? 'text-[15px]' : 'text-[22px]')}>
									{candidate.name}
								</h1>
								{/* percentil só aparece com amostra suficiente pra significar algo */}
								{benchmark.topPercent !== null && benchmark.topPercent <= 25 && (
									<span className='rounded-md bg-lime-soft px-2 py-0.5 text-[11px] font-medium text-lime-fg'>
										{t('candidate.topPercent', {
											percent: benchmark.topPercent,
										})}
									</span>
								)}
							</div>
							<p
								className={cn(
									'mt-0.5 flex-wrap items-center gap-x-1.5 text-[12.5px] text-text-2',
									compact ? 'hidden' : 'flex',
								)}
							>
								{candidate.occupation && <span>{candidate.occupation}</span>}
								{candidate.yearsOfExperience !== null && (
									<span className='text-muted'>
										·{' '}
										{t('candidate.years', {
											count: candidate.yearsOfExperience,
										})}
									</span>
								)}
								{candidate.location && <span className='text-muted'>· {candidate.location}</span>}
							</p>

							{!compact && (
							<ContactActions
								email={candidate.email}
								phone={candidate.phone}
								linkedinUrl={candidate.linkedinUrl}
							/>
							)}
						</div>
					</div>

					{candidate.resumeUrl && (
						<a
							href={candidate.resumeUrl}
							target='_blank'
							rel='noreferrer'
							className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] text-text-2 transition-colors hover:bg-hover hover:text-text'
						>
							<FileText size={13} /> {t('candidate.resume')}
						</a>
					)}
				</div>

				<div className={cn('mt-4', compact && 'hidden')}>
					<ProcessTrail
						stages={trail}
						daysInProcess={dossier.trail.daysInProcess}
						medianDays={dossier.trail.jobMedianDays}
						daysWithoutAnswer={dossier.trail.daysInStage}
						atRisk={dossier.trail.atRisk}
					/>
					<PeerNav
						jobId={jobId}
						currentId={candidateId}
						peers={peers.peers}
						position={peers.position}
						total={peers.total}
						previous={peers.previous}
						next={peers.next}
					/>
				</div>
			</div>

			{/*
			 * Barra de decisão fixa.
			 *
			 * Ler as respostas de uma entrevista é rolar a tela inteira; com as
			 * ações só no topo, decidir exigia voltar lá em cima — e quem volta
			 * perde o que acabou de ler. Aqui a decisão anda junto com a evidência,
			 * e a fila (← →) fica ao lado dela porque avaliar é sequência.
			 */}
			<div className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-2'>
				<div className='flex min-w-0 items-center gap-2'>
					{candidate.photoUrl ? (
						<img
							src={candidate.photoUrl}
							alt=''
							width={22}
							height={22}
							className='h-[22px] w-[22px] shrink-0 rounded-full object-cover'
						/>
					) : (
						<span className='flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-lime-soft text-[9.5px] font-semibold text-lime-fg'>
							{candidate.name.slice(0, 2).toUpperCase()}
						</span>
					)}
					<span className='max-w-[180px] truncate text-[12.5px] font-medium'>{candidate.name}</span>
					{/*
					 * A nota do cabeçalho segue o mesmo gate do painel.
					 *
					 * Sem isto a tela se contradizia: o topo estampava "0,5/10"
					 * enquanto o corpo dizia que a análise só sai com a entrevista
					 * concluída. Duas versões da mesma verdade na mesma tela é pior
					 * que nenhuma.
					 */}
					{concluida && interview?.score !== null && interview?.score !== undefined && (
						<span className='font-num text-[12px] text-text-2'>
							{interview.score.toFixed(1).replace('.', ',')}
							<span className='text-muted'>/10</span>
						</span>
					)}
				</div>

				{/* como a entrevista foi feita — contexto de leitura, não detalhe.
				    Sem o Motor não há entrevista: falar "Vídeo" aqui era ficção. */}
				{features.motor && (
					<InterviewBadges
						typeInterview={job.typeInterview}
						interviewMode={job.interviewMode}
						language={job.language}
					/>
				)}

				<PeerNav
					jobId={jobId}
					currentId={candidateId}
					peers={peers.peers}
					position={peers.position}
					total={peers.total}
					previous={peers.previous}
					next={peers.next}
					compact
					hidePosition
				/>

				<div className='ml-auto flex items-center gap-2'>
					{/*
					 * Reprovado é estado TERMINAL: oferecer "Reprovar" de novo (e
					 * "Avançar") pra quem já saiu do processo era o botão mentindo.
					 * O badge diz o estado e, quando foi o filtro, quem decidiu.
					 */}
					{dossier.application.stage?.toLowerCase() === 'rejected' ? (
						<span className='inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] font-medium text-danger'>
							{t('candidate.rejectedBadge')}
							{dossier.application.rejectionDecisionSource === 'knockout' &&
								` — ${t('candidate.rejectedByScreening')}`}
						</span>
					) : (
						<>
							<Button variant='secondary' disabled={isMoving} onClick={() => setRejecting(true)}>
								{t('reject.confirm')}
							</Button>
							{nextStage && (
								<Button disabled={isMoving} onClick={() => void advance()}>
									{t('candidate.advanceTo', { stage: nextStage.label })}
									<ArrowRight size={13} />
								</Button>
							)}
						</>
					)}
				</div>
			</div>

			<div
				className={cn(
					// `min-h-0` é o que permite o filho rolar dentro do flex
					'grid min-h-0 flex-1 gap-3 overflow-y-auto p-4',
					/*
					 * Proporção, não coluna fixa.
					 *
					 * Com a esquerda travada em 340px, toda largura extra do monitor ia
					 * para a entrevista: numa tela de 1440 a coluna do perfil ficava com
					 * 24% e o texto da experiência quebrava a cada 5 palavras, enquanto
					 * o card da entrevista sobrava espaço. 2fr/3fr mantém a entrevista
					 * como protagonista sem espremer o perfil.
					 */
					'xl:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)]',
				)}
			>
				<div className='flex flex-col gap-4'>
					{!hasProfile && (
						<ProfileRequestCard
							jobId={jobId}
							candidateId={candidateId}
							candidateName={candidate.name}
						/>
					)}
					<ExperienceCard experiences={candidate.experiences} summary={candidate.summary} />
					<SkillsCard skills={dossier.skills} />
					<EducationCard education={candidate.education} languages={candidate.languages} />
					<JobContextCard
						job={job}
						jobName={dossier.application.jobName}
						jobId={jobId}
						known={jobKnown}
					/>
					<TimelinePanel jobId={jobId} candidateId={candidateId} />
				</div>

				<div className='flex flex-col gap-4'>
					{/*
					 * Bloqueio SaaS (V2-704) no topo da coluna de avaliação: é a
					 * primeira coisa que explica por que o resto está vazio.
					 * Enterprise nunca recebe `locked: true`.
					 */}
					{dossier.locked && (
						<UnlockCard
							jobId={jobId}
							candidateId={dossier.candidate.id}
							jobAppliedId={dossier.application.jobAppliedId}
						/>
					)}

					{/*
					 * Reprovação MANUAL: o motivo tipado e a mensagem que o candidato
					 * recebeu por e-mail. Sem este card, a tela só dizia "movido para
					 * Reprovado" e o recrutador não via a própria decisão (relato do
					 * teste da open). O caso knockout tem card próprio logo abaixo.
					 */}
					{dossier.application.stage?.toLowerCase() === 'rejected' &&
						dossier.application.rejectionDecisionSource !== 'knockout' &&
						dossier.application.rejectionReasonLabel && (
							<RejectionCard
								reasonLabel={dossier.application.rejectionReasonLabel}
								note={dossier.application.rejectionNote}
							/>
						)}

					{/*
					 * O filtro de candidatura respondido — primeiro na coluna quando
					 * existe, porque quando ele REPROVOU é a única explicação da tela.
					 */}
					{dossier.application.screeningKnockout && (
						<ScreeningKnockoutCard
							data={dossier.application.screeningKnockout}
							evidence={dossier.application.rejectionEvidence}
						/>
					)}

					{/*
					 * Prova de entrevista verificada (OTS) que o candidato trouxe no
					 * apply. O conteúdo é o que ELE consentiu divulgar — nunca o
					 * veredito da outra empresa.
					 */}
					{dossier.application.otsAttestation && (
						<OtsAttestationCard data={dossier.application.otsAttestation} />
					)}

					{concluida && interview ? (
						<InterviewPanel
							userId={dossier?.candidate.id}
							jobAppliedId={dossier?.application.jobAppliedId}
							score={interview.score}
							jobAverage={benchmark.jobAverage}
							jobCandidates={benchmark.jobCandidates}
							questionCount={interview.questionCount}
							competencies={interview.competencies}
							questions={interview.questions}
							summary={interview.summary}
							recommendation={interview.recommendation}
							strengths={interview.strengths}
							developmentAreas={interview.developmentAreas}
							authenticity={interview.authenticity ?? null}
							translations={interview.translations ?? []}
							translationsByLanguage={interview.translationsByLanguage}
							onRequestTranslation={(language) => void requestTranslation(language)}
							translating={translating !== null}
						/>
					) : (
						/*
						 * Entrevista inacabada MUDA O ASSUNTO da tela.
						 *
						 * Ela existe para decidir, e não há o que decidir sobre quem não
						 * terminou — mas o painel de nota e o formulário de avaliação
						 * continuavam ali, mostrando "—/10" e pedindo nota de SQL e
						 * Comunicação de quem não falou. Um campo que não pode ser
						 * preenchido com honestidade é convite para preencher
						 * desonestamente.
						 *
						 * O gate anterior olhava se EXISTE `interview`, e existe: o
						 * documento nasce com uma entrada por pergunta assim que a
						 * sessão abre. Quem responde é `application.finished`.
						 *
						 * Dois casos, duas conversas: quem nunca abriu o link se cobra;
						 * quem parou na terceira pergunta se lembra de terminar — e
						 * merece ver o que já disse.
						 */
						features.motor ? (
							<PendingInterviewPanel
								answered={dossier.application.answeredCount}
								total={dossier.application.questionTotal}
								questions={interview?.questions ?? []}
								onRemind={() => setInviting(true)}
							/>
						) : (
							/*
							 * Sem o plugin do Motor não existe entrevista a cobrar — o
							 * painel de pendência mentiria ("lembre o candidato" de um
							 * link que não abre). O aviso diz o que esta coluna faria.
							 */
							<MotorNotice context='interview' />
						)
					)}

					{/*
					 * ORDEM: a nota da IA primeiro.
					 *
					 * Oferta e "sua avaliação" entraram depois, no topo desta coluna, e
					 * empurraram a entrevista para fora da primeira tela — quem abria o
					 * dossiê não via a nota do candidato sem rolar. É o número que
					 * justifica a existência desta tela, e as outras duas dependem dele:
					 * avaliar sem ver a evidência é chute, e fazer oferta antes de
					 * avaliar é pior ainda. Agora a leitura desce na ordem da decisão —
					 * evidência, julgamento, proposta.
					 */}
					{/* avaliar exige evidência: entrevista inacabada não gera formulário */}
					{concluida && interview && (
					<ScorecardPanel
						jobId={jobId}
						candidateId={candidateId}
						aiScore={interview?.score ?? null}
						jobSkills={job.mainSkills}
					/>
					)}

					{['selected', 'approved', 'hired'].includes(dossier.application.stage) && (
						<OfferPanel jobId={jobId} candidateId={candidateId} />
					)}
				</div>
			</div>

			<InviteModal
				open={inviting}
				jobId={jobId}
				candidateIds={[candidateId]}
				onClose={() => setInviting(false)}
			/>

			<RejectionModal
				open={rejecting}
				count={1}
				submitting={isMoving}
				onCancel={() => setRejecting(false)}
				onConfirm={(payload) => void confirmRejection(payload)}
			/>
		</div>
	)
}

function str(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}

function ExperienceCard({
	experiences,
	summary,
}: {
	experiences: Array<Record<string, unknown>>
	summary: string | null
}) {
	const { t } = useTranslation()

	if (experiences.length === 0 && !summary) {
		return (
			<Card title={t('candidate.experience')}>
				<p className='text-[12px] text-muted'>{t('candidate.noExperience')}</p>
			</Card>
		)
	}

	return (
		<Card title={t('candidate.experience')}>
			{summary && <p className='mb-3 text-[12.5px] leading-relaxed text-text-2'>{summary}</p>}
			<ol className='flex flex-col gap-3'>
				{experiences.map((item, index) => {
					const title = str(item.title) ?? '—'
					const company = str(item.company)
					const period = [str(item.startDate), str(item.endDate) ?? t('candidate.present')]
						.filter(Boolean)
						.join(' — ')
					return (
						<li key={`${title}-${index}`} className='flex gap-2.5'>
							<span className='mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-card-alt text-[10px] font-semibold text-text-2'>
								{(company ?? title).slice(0, 2).toUpperCase()}
							</span>
							<div className='min-w-0 flex-1'>
								<p className='flex flex-wrap items-baseline justify-between gap-2'>
									<span className='text-[12.5px] font-medium'>
										{title}
										{company && <span className='ml-1.5 text-text-2'>{company}</span>}
									</span>
									<span className='font-num text-[11px] text-muted'>{period}</span>
								</p>
								{str(item.description) && (
									<p className='mt-0.5 text-[11.5px] leading-relaxed text-text-2'>
										{str(item.description)}
									</p>
								)}
							</div>
						</li>
					)
				})}
			</ol>
		</Card>
	)
}

/**
 * Skills, com a evidência que as sustenta.
 *
 * ## O que mudou e por quê
 *
 * O cartão mostrava uma bolinha cheia ou vazia. "Cheia" significava apenas que
 * a skill foi ASSUNTO de uma pergunta respondida — alguém podia responder mal e
 * continuar marcado. Enquanto isso, a entrevista já produzia nota, nível de
 * evidência e o TRECHO que serviu de prova, e nada disso aparecia.
 *
 * Currículo diz, entrevista prova: jogar a prova fora e mostrar um selo binário
 * desperdiçava exatamente o argumento do produto.
 *
 * Três estados, porque são três graus de certeza diferentes — e tratá-los como
 * dois obrigava a mentir num deles.
 */
function SkillsCard({
	skills,
}: {
	skills: Array<{
		name: string
		verified: boolean
		score: number | null
		evidenceLevel: string | null
		evidence: string | null
		needsValidation: boolean
		source: 'assessed' | 'mentioned' | 'declared'
	}>
}) {
	const { t } = useTranslation()
	const [open, setOpen] = useState<string | null>(null)
	if (skills.length === 0) return null

	/*
	 * Agrupado por FORÇA DA EVIDÊNCIA, em nuvens de chips.
	 *
	 * A versão anterior era uma linha de largura cheia por skill, com a nota
	 * crua ao lado: vinte linhas dizendo "3,0 avaliada", um selo que se repetia
	 * em quase todas e um número sem escala. Feedback do Henrique: "essa lista
	 * gigante com essas notas que não dá pra entender nada".
	 *
	 * Duas correções de fundo:
	 *
	 * 1. `pontuacao` é de 1 a 5 (matriz do ai-engine) e a tela mostrava "3,0"
	 *    sem dizer de quanto — lido como 3 de 10, ou seja, o oposto. O número
	 *    saiu do chip e aparece na evidência, com a escala escrita.
	 *
	 * 2. `nivel_evidencia` já é a leitura pronta (forte|moderada|fraca) e estava
	 *    escondida atrás do clique, enquanto o número cru ficava à mostra.
	 *    Inverti: a palavra vira o título do grupo, e o grupo faz a leitura que
	 *    o recrutador faria linha a linha.
	 */
	const NIVEIS = ['forte', 'moderada', 'fraca'] as const
	const nivelDe = (skill: { evidenceLevel: string | null }) =>
		NIVEIS.find((nivel) => (skill.evidenceLevel ?? '').toLowerCase().startsWith(nivel))

	const grupos = [
		...NIVEIS.map((nivel) => ({
			chave: nivel,
			itens: skills.filter((skill) => nivelDe(skill) === nivel),
		})),
		// sem evidência: citada de passagem ou só escrita no currículo
		{ chave: 'declared' as const, itens: skills.filter((skill) => !nivelDe(skill)) },
	].filter((grupo) => grupo.itens.length > 0)

	return (
		<Card title={t('candidate.skills')}>
			<div className='flex flex-col gap-3'>
				{grupos.map((grupo) => (
					<div key={grupo.chave}>
						<p className='mb-1.5 text-[11px] uppercase tracking-wider text-muted'>
							{t(`candidate.skillGroup.${grupo.chave}`)}
							<span className='font-num ml-1.5 normal-case text-muted'>
								{grupo.itens.length}
							</span>
						</p>

						<div className='flex flex-wrap gap-1.5'>
							{grupo.itens.map((skill) => {
								const abrivel = Boolean(skill.evidence)
								const aberta = open === skill.name
								return (
									<button
										key={skill.name}
										onClick={() => setOpen(aberta ? null : skill.name)}
										disabled={!abrivel}
										className={cn(
											'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] transition-colors',
											grupo.chave === 'forte'
												? 'border-lime-mid bg-lime-soft/50 text-text'
												: grupo.chave === 'declared'
													? 'border-border text-text-2'
													: 'border-border bg-card-alt text-text',
											abrivel && 'hover:bg-hover',
											aberta && 'ring-1 ring-lime',
										)}
									>
										{skill.name}
										{/* só o que PEDE ação continua marcado; o resto o grupo já disse */}
										{skill.needsValidation && (
											<span className='text-[10.5px] text-amber'>
												{t('candidate.skillNeedsValidation')}
											</span>
										)}
									</button>
								)
							})}
						</div>
					</div>
				))}
			</div>

			{/* a evidência abre UMA vez, abaixo de tudo: não empurra os chips a cada clique */}
			{open && (
				<EvidenciaDaSkill skill={skills.find((item) => item.name === open)!} />
			)}

			<p className='mt-3 text-[11px] text-muted'>{t('candidate.skillsLegend')}</p>
		</Card>
	)
}

function EvidenciaDaSkill({
	skill,
}: {
	skill: { name: string; score: number | null; evidenceLevel: string | null; evidence: string | null }
}) {
	const { t } = useTranslation()
	if (!skill.evidence) return null
	return (
		<div className='mt-3 rounded-lg border border-border border-l-[3px] border-l-lime bg-card px-3 py-2.5'>
			<p className='flex flex-wrap items-baseline gap-x-2 text-[12px] font-medium'>
				{skill.name}
				{skill.score !== null && (
					<span className='font-num text-[11.5px] font-normal text-muted'>
						{/* a escala escrita: "3 de 5" não é ambíguo, "3,0" é */}
						{t('candidate.skillScoreOf', { score: skill.score.toFixed(0) })}
					</span>
				)}
			</p>
			<p className='mt-1 text-[12px] leading-snug text-text-2'>{skill.evidence}</p>
		</div>
	)
}

function EducationCard({
	education,
	languages,
}: {
	education: Array<Record<string, unknown>>
	languages: Array<Record<string, unknown>>
}) {
	const { t } = useTranslation()
	if (education.length === 0 && languages.length === 0) return null

	return (
		<Card title={t('candidate.education')}>
			<ol className='flex flex-col gap-2'>
				{education.map((item, index) => (
					<li
						key={`${str(item.institution)}-${index}`}
						className='flex flex-wrap items-baseline justify-between gap-2'
					>
						<span className='text-[12.5px]'>
							{str(item.degree) ?? '—'}
							{str(item.institution) && (
								<span className='text-text-2'> — {str(item.institution)}</span>
							)}
						</span>
						<span className='font-num text-[11px] text-muted'>
							{[str(item.startDate), str(item.endDate)].filter(Boolean).join(' — ')}
						</span>
					</li>
				))}
			</ol>

			{languages.length > 0 && (
				<div className='mt-3 flex flex-col gap-1.5 border-t border-border-soft pt-3'>
					{languages.map((item, index) => (
						<div key={`${str(item.language)}-${index}`} className='flex items-center gap-3'>
							<span className='w-24 shrink-0 truncate text-[12px]'>{str(item.language)}</span>
							<span className='text-[11.5px] text-text-2'>{str(item.proficiency)}</span>
						</div>
					))}
				</div>
			)}
		</Card>
	)
}

/**
 * Contexto da vaga.
 *
 * A nota da entrevista só significa alguma coisa contra o que foi PEDIDO —
 * julgar uma resposta sem ver o requisito é adivinhação. Fica recolhido por
 * padrão porque quem revisa o segundo candidato do dia já leu a descrição.
 */
function JobContextCard({
	job,
	jobName,
	jobId,
	known,
}: {
	job: {
		description: string | null
		requirements: string | null
		responsibilities: string | null
		level: string | null
		model: string | null
		contractType: string | null
		mainSkills: string | null
		screeningObjective: string | null
	}
	jobName: string | null
	jobId: string
	/** O core respondeu com o bloco da vaga? "Não sei" não é "não tem". */
	known: boolean
}) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)

	const blocks = [
		{ label: t('candidate.jobDescription'), value: job.description },
		{ label: t('candidate.jobRequirements'), value: job.requirements },
		{ label: t('candidate.jobResponsibilities'), value: job.responsibilities },
	].filter((block) => Boolean(block.value))

	const skills = (job.mainSkills ?? '')
		.split(',')
		.map((skill) => skill.trim())
		.filter(Boolean)

	return (
		<Card
			title={t('candidate.jobContext')}
			description={jobName ?? undefined}
			actions={
				blocks.length > 0 ? (
					<button
						onClick={() => setOpen((v) => !v)}
						className='text-[12px] text-lime-fg hover:underline'
					>
						{t(open ? 'candidate.collapse' : 'candidate.expand')}
					</button>
				) : undefined
			}
		>
			{(job.level || job.model || job.contractType || skills.length > 0) && (
				<div className='flex flex-wrap gap-1.5'>
					{[job.level, job.model, job.contractType].filter(Boolean).map((tag) => (
						<span
							key={String(tag)}
							className='rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-2'
						>
							{String(tag)}
						</span>
					))}
					{skills.map((skill) => (
						<span
							key={skill}
							className='rounded-md border border-lime-mid bg-lime-soft px-1.5 py-0.5 text-[11px] text-lime-fg'
						>
							{skill}
						</span>
					))}
				</div>
			)}

			{job.screeningObjective && (
				<p className='mt-2.5 rounded-lg border border-lime-mid bg-lime-soft px-2.5 py-2 text-[12px] leading-snug'>
					<span className='font-medium'>{t('candidate.screeningObjective')}: </span>
					{job.screeningObjective}
				</p>
			)}

			{/*
			 * Fechado mostra as 3 primeiras linhas da descrição em vez de nada: o
			 * recrutador precisa lembrar o que foi pedido, e obrigar um clique pra
			 * ler a primeira frase é o tipo de atrito que faz ninguém abrir.
			 */}
			{!open && job.description && (
				<p className='mt-2.5 line-clamp-3 whitespace-pre-line text-[12px] leading-relaxed text-text-2'>
					{job.description}
				</p>
			)}

			{open &&
				blocks.map((block) => (
					<div key={block.label} className='mt-3 border-t border-border-soft pt-2.5'>
						<p className='text-[11px] font-medium uppercase tracking-wide text-muted'>
							{block.label}
						</p>
						<p className='mt-1 whitespace-pre-line text-[12px] leading-relaxed text-text-2'>
							{block.value}
						</p>
					</div>
				))}

			{/*
			 * §7: o que não está configurado vira convite com caminho — mas SÓ
			 * quando se sabe que está vazio. Entre um deploy e outro o core antigo
			 * não manda o bloco da vaga, e aí este texto acusava de "sem descrição"
			 * uma vaga inteiramente preenchida.
			 */}
			{known && blocks.length === 0 && (
				<div className='mt-1 flex flex-wrap items-center gap-2'>
					<p className='text-[12px] text-text-2'>{t('candidate.jobEmpty')}</p>
					<Link
						to='/vagas/$jobId/editar'
						params={{ jobId }}
						className='text-[12px] text-lime-fg hover:underline'
					>
						{t('candidate.jobEmptyAction')}
					</Link>
				</div>
			)}
		</Card>
	)
}

/**
 * Entrevista que não terminou.
 *
 * Dois estados numa peça só, porque a diferença entre eles é de GRAU e não de
 * natureza — a pergunta em ambos é "cobro ou desisto?", e o que muda é quanto
 * a pessoa já investiu. Quem parou na terceira pergunta tem mais chance de
 * voltar do que quem nunca abriu o link, e o recrutador precisa ver isso antes
 * de decidir o tom da cobrança.
 *
 * O que NÃO aparece aqui é tão importante quanto o que aparece: nenhuma nota,
 * nenhum comparativo com a vaga, nenhum campo de avaliação. A análise da IA
 * roda na conclusão; oferecer um formulário antes disso é pedir julgamento sem
 * evidência.
 */
function PendingInterviewPanel({
	answered,
	total,
	questions,
	onRemind,
}: {
	answered: number
	total: number
	questions: Array<{ id: string; question: string; answer: string | null; answered: boolean }>
	onRemind: () => void
}) {
	const { t } = useTranslation()
	const comecou = answered > 0
	const respondidas = questions.filter((item) => item.answered)

	return (
		<div className='overflow-hidden rounded-xl border border-border bg-card'>
			<div className='border-b border-border-soft px-4 py-5 text-center'>
				<p className='text-[13px] font-medium'>
					{t(comecou ? 'candidate.partialTitle' : 'candidate.noInterviewTitle')}
				</p>
				<p className='mx-auto mt-1 max-w-[440px] text-[12px] leading-relaxed text-text-2'>
					{comecou
						? t('candidate.partialHint', { answered, total })
						: t('candidate.noInterviewHint')}
				</p>

				{/*
				 * Progresso como barra, não como frase.
				 *
				 * "2 de 5" obriga a fazer a conta; a barra mostra de imediato se a
				 * pessoa encostou na entrevista ou chegou perto do fim — que é o que
				 * decide se vale insistir.
				 */}
				{comecou && total > 0 && (
					<div className='mx-auto mt-4 flex max-w-[280px] items-center gap-1'>
						{Array.from({ length: total }, (_, index) => (
							<span
								key={index}
								className={cn(
									'h-1.5 flex-1 rounded-[1px]',
									index < answered ? 'bg-lime' : 'bg-data-track',
								)}
							/>
						))}
					</div>
				)}

				<div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
					<RequireCapability capability='candidate:move'>
						<Button variant='primary' onClick={onRemind}>
							<Send size={13} /> {t('candidate.remind')}
						</Button>
					</RequireCapability>
				</div>
			</div>

			{/* o que existe fica disponível: são respostas reais, só não formam nota */}
			{respondidas.length > 0 && (
				<div className='px-4 py-4'>
					<p className='text-[12px] font-medium'>{t('candidate.partialAnswers')}</p>
					<p className='mt-0.5 text-[11.5px] text-muted'>{t('candidate.partialAnswersHint')}</p>
					<ul className='mt-3 flex flex-col gap-3'>
						{respondidas.map((item, index) => (
							<li key={item.id} className='rounded-lg border border-border-soft bg-card-alt p-3'>
								<p className='text-[12px] font-medium leading-snug'>
									<span className='font-num mr-1.5 text-muted'>{index + 1}.</span>
									{item.question}
								</p>
								{item.answer && (
									<p className='mt-1.5 whitespace-pre-line text-[12px] leading-relaxed text-text-2'>
										{item.answer}
									</p>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	)
}

/**
 * Filtro de candidatura respondido (knockout): pergunta, resposta e o que
 * reprovou. É a resposta ao "por que este candidato está reprovado?" que a
 * tela devia ter dado desde o primeiro apply da distribuição open.
 */
function ScreeningKnockoutCard({
	data,
	evidence,
}: {
	data: {
		passed: boolean | null
		answers: Array<{ question: string; answer: string | number | boolean | null; failed: boolean }>
	}
	evidence: string | null
}) {
	const { t } = useTranslation()

	const formatAnswer = (value: string | number | boolean | null) => {
		if (value === true) return t('candidate.screening.yes')
		if (value === false) return t('candidate.screening.no')
		if (value === null || value === '') return '—'
		return String(value)
	}

	return (
		<Card
			title={t('candidate.screening.title')}
			description={t(
				data.passed === false ? 'candidate.screening.failedHint' : 'candidate.screening.passedHint',
			)}
		>
			<ul className='flex flex-col gap-2'>
				{data.answers.map((item, index) => (
					<li
						key={index}
						className={cn(
							'flex items-start justify-between gap-3 rounded-lg border px-3 py-2',
							item.failed ? 'border-danger/40 bg-danger-soft' : 'border-border bg-surface',
						)}
					>
						<span className='text-[12.5px] leading-snug'>{item.question}</span>
						<span
							className={cn(
								'shrink-0 text-[12.5px] font-semibold',
								item.failed ? 'text-danger' : 'text-text',
							)}
						>
							{formatAnswer(item.answer)}
						</span>
					</li>
				))}
			</ul>
			{evidence && <p className='mt-3 text-[12px] leading-relaxed text-text-2'>{evidence}</p>}
		</Card>
	)
}

/**
 * Prova de entrevista verificada (OTS 0.2) apresentada pelo candidato no
 * apply. A verificação já aconteceu no servidor (assinatura do emissor,
 * vínculo de e-mail, revogação) — o card conta O QUE foi verificado e
 * quando, e dá o link de status pra re-checagem independente.
 */
function OtsAttestationCard({
	data,
}: {
	data: {
		tier: 'existence' | 'summary' | 'full'
		iss: string
		companyName: string | null
		jobTitle: string | null
		completedAt: string
		questionsTotal: number | null
		outcome: { score: number | null; strengths: string[]; developmentAreas: string[] } | null
		verifiedAt: string
		revocationStatus: string
		statusUrl: string
	}
}) {
	const { t, i18n } = useTranslation()
	const issuerHost = (() => {
		try {
			return new URL(data.iss).host
		} catch {
			return data.iss
		}
	})()
	const formatDate = (iso: string) =>
		new Date(iso).toLocaleDateString(i18n.language, {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		})

	return (
		<Card
			title={
				<span className='inline-flex items-center gap-1.5'>
					<BadgeCheck size={15} className='text-lime-fg' />
					{t('candidate.otsAttestation.title')}
				</span>
			}
			description={t('candidate.otsAttestation.hint', { issuer: issuerHost })}
		>
			<div className='flex flex-col gap-2 text-[12.5px]'>
				<p>
					<span className='font-medium'>
						{data.jobTitle ?? t('candidate.otsAttestation.unknownJob')}
					</span>
					{data.companyName ? ` · ${data.companyName}` : ''}
					{' — '}
					{t('candidate.otsAttestation.completedAt', { date: formatDate(data.completedAt) })}
					{data.questionsTotal
						? ` · ${t('candidate.otsAttestation.questions', { count: data.questionsTotal })}`
						: ''}
				</p>
				{data.outcome && (
					<>
						{data.outcome.score != null && (
							<p>
								{t('candidate.otsAttestation.score')}:{' '}
								<span className='font-num font-semibold'>{data.outcome.score.toFixed(1)}</span>
								<span className='text-text-2'>/10</span>
							</p>
						)}
						{data.outcome.strengths.length > 0 && (
							<p className='text-text-2'>
								<span className='font-medium text-text'>
									{t('candidate.otsAttestation.strengths')}:
								</span>{' '}
								{data.outcome.strengths.join(' · ')}
							</p>
						)}
						{data.outcome.developmentAreas.length > 0 && (
							<p className='text-text-2'>
								<span className='font-medium text-text'>
									{t('candidate.otsAttestation.development')}:
								</span>{' '}
								{data.outcome.developmentAreas.join(' · ')}
							</p>
						)}
					</>
				)}
				<p className='text-[11.5px] text-text-2'>
					{t('candidate.otsAttestation.verifiedAt', { date: formatDate(data.verifiedAt) })}
					{' · '}
					<a
						href={data.statusUrl}
						target='_blank'
						rel='noreferrer'
						className='underline decoration-dotted underline-offset-2 hover:text-text'
					>
						{t('candidate.otsAttestation.statusLink')}
					</a>
				</p>
			</div>
		</Card>
	)
}


/**
 * Reprovação manual — a decisão e a mensagem, na tela onde a decisão foi
 * tomada. A mensagem é a MESMA que foi no e-mail: mostrar outra coisa aqui
 * criaria duas versões da conversa com o candidato.
 */
function RejectionCard({
	reasonLabel,
	note,
}: {
	reasonLabel: string
	note: string | null
}) {
	const { t } = useTranslation()
	return (
		<Card title={t('candidate.rejection.title')}>
			<p className='text-[13px]'>
				<span className='text-text-2'>{t('candidate.rejection.reason')}: </span>
				<span className='font-medium'>{reasonLabel}</span>
			</p>
			{note && (
				<p className='mt-2 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] leading-relaxed'>
					{note}
				</p>
			)}
			<p className='mt-2 text-[11.5px] text-text-2'>{t('candidate.rejection.sentHint')}</p>
		</Card>
	)
}
