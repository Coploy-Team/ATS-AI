import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { VideoPlayer } from '@/features/candidate/video-player'
import { cn } from '@/lib/cn'
import { normalizeScore } from '@/lib/score'
import { Page } from '@/ui/page'

interface Pergunta {
	id: string
	question: string
	video: string | null
	audio: string | null
	captionSegments: Array<{ start: number; end: number; text: string }> | null
	feedback: string | null
	strengths: string[] | null
	improvement: string[] | null
	/** O que a pessoa disse, transcrito. */
	answer: string | null
	recommendation: string | null
	skipped: boolean
}

/**
 * String vazia é AUSÊNCIA, não valor.
 *
 * `??` só protege contra `null`/`undefined`, e o dado real traz `video: ""` numa
 * entrevista que é só de áudio. O `src` recebia `""`, o player dizia "sem mídia
 * para esta pergunta" e o áudio estava ali do lado, íntegro. Mesmo gênero do
 * `|| null` que sumia com a nota zero, ao contrário: lá o falsy comia um valor
 * legítimo, aqui o nullish deixou passar um vazio.
 */
function ouNulo(valor: unknown): string | null {
	return typeof valor === 'string' && valor.trim() ? valor : null
}

function comoLista(valor: unknown): string[] | null {
	if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === 'string')
	return typeof valor === 'string' && valor ? [valor] : null
}

/**
 * A entrevista compartilhada, dentro do ATS.
 *
 * O recorte já veio do servidor: se "retorno da IA" não foi liberado, os campos
 * nem chegam. Esta tela mostra o que veio — nunca esconde por conta própria,
 * porque isso daria a impressão de controle que não é dela.
 */
export function SharedCandidatePage() {
	const { t } = useTranslation()
	const navigate = useNavigate()
	const { userId } = useParams({ strict: false }) as { userId: string }
	const { s: code } = useSearch({ strict: false }) as { s?: string }
	const [atual, setAtual] = useState(0)

	const { data, isLoading, isError } = empresa.useGetCompaniesShareLinksCodeCandidatesUserId(
		code ?? '',
		userId,
		{ query: { enabled: Boolean(code && userId) } },
	)

	/*
	 * O tipo gerado é a UNIÃO de 200 e 404, então `data` só carrega os campos
	 * depois de estreitar. Estreitar por presença é mais honesto que `as` no
	 * objeto inteiro: se vier 404, cai no estado de link inválido logo abaixo.
	 */
	const corpo = data?.data as
		| {
				jobApplied?: Record<string, unknown>
				visibility?: Record<string, boolean>
				profile?: {
					headline: string | null
					summary: string | null
					resumeUrl: string | null
					skills: string[]
					experiences: Array<Record<string, unknown>>
					education: Array<Record<string, unknown>>
					languages: Array<Record<string, unknown>>
				} | null
		  }
		| undefined
	const jobApplied = corpo?.jobApplied ?? {}
	const visibility = corpo?.visibility
	const perfil = corpo?.profile ?? null
	const interview = (jobApplied.interview ?? {}) as Record<string, unknown>

	const info = Array.isArray(interview.info)
		? (interview.info as Array<Record<string, unknown>>)
		: []
	const perguntas: Pergunta[] = info.map((item, indice) => ({
		id: String(item.id ?? indice),
		question: String(item.question ?? ''),
		video: ouNulo(item.video),
		audio: ouNulo(item.audio),
		captionSegments: Array.isArray(item.captionSegments)
			? (item.captionSegments as Pergunta['captionSegments'])
			: null,
		feedback: ouNulo(item.feedback),
		strengths: comoLista(item.strengths),
		improvement: comoLista(item.improvement),
		answer: ouNulo(item.answer),
		recommendation: ouNulo(item.qRecomendation),
		skipped: item.pulou_a_pergunta === true,
	}))

	const pergunta = perguntas[atual]
	/*
	 * COMO a entrevista foi feita.
	 *
	 * O Henrique abriu um compartilhamento e perguntou onde estava o vídeo. Não
	 * havia: a vaga é `interviewMode: 'whatsapp'`, e por WhatsApp o candidato
	 * responde por áudio. A tela mostrava um player de som sem explicar, e
	 * ausência sem explicação parece defeito.
	 */
	const modo = typeof jobApplied.interviewMode === 'string' ? jobApplied.interviewMode : null
	const score = normalizeScore(interview.score ?? jobApplied.score)

	if (isError || (!isLoading && perguntas.length === 0)) {
		return (
			<Page title={t('shared.title')}>
				<div className='rounded-xl border border-border bg-card px-4 py-14 text-center'>
					<p className='text-[13px] font-medium'>{t('shared.invalidTitle')}</p>
					<p className='mt-1 text-[12.5px] text-muted'>{t('shared.invalidHint')}</p>
				</div>
			</Page>
		)
	}

	return (
		<Page
			title={String(jobApplied.name ?? t('shared.title'))}
			subtitle={
				<button
					onClick={() => navigate({ to: '/compartilhado', search: { s: code ?? '' } })}
					className='inline-flex items-center gap-1.5 text-muted transition-colors hover:text-text'
				>
					<ArrowLeft size={13} /> {t('shared.back')}
				</button>
			}
			actions={
				<span className='flex items-center gap-2'>
					{modo && (
						<span className='rounded-md border border-border px-2 py-1 text-[12px] text-muted'>
							{t(`shared.mode.${modo}`, { defaultValue: modo })}
						</span>
					)}
					{visibility?.score && score !== null && (
						<span className='font-num rounded-md border border-border px-2 py-1 text-[13px]'>
							{score.toFixed(1).replace('.', ',')}
							<span className='text-muted'>/10</span>
						</span>
					)}
				</span>
			}
		>
			{isLoading ? (
				<div className='h-[420px] animate-pulse rounded-xl border border-border bg-card' />
			) : (
				/*
				 * Duas colunas, como o dossiê do ATS: quem a pessoa É à esquerda, o que
				 * ela RESPONDEU à direita. Só o vídeo não basta para decidir — sem a
				 * trajetória, o destinatário julga alguém que ele não conhece.
				 */
				<div className='grid gap-3 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:items-start'>
				<div className='flex flex-col gap-3'>
					{perfil?.summary && (
						<Bloco titulo={t('shared.profile.summary')}>
							<p className='text-[12.5px] leading-relaxed text-text-2'>{perfil.summary}</p>
						</Bloco>
					)}
					{(perfil?.experiences.length ?? 0) > 0 && (
						<Bloco titulo={t('shared.profile.experience')}>
							<ul className='flex flex-col'>
								{perfil!.experiences.map((item, i) => (
									<li key={i} className='border-b border-border-soft py-2.5 first:pt-0 last:border-0 last:pb-0'>
										<p className='text-[12.5px] font-medium'>{String(item.title ?? '—')}</p>
										<p className='mt-0.5 text-[11.5px] text-muted'>
											{String(item.company ?? '')}
											{item.startDate ? ` · ${String(item.startDate)}` : ''}
											{item.current ? ` — ${t('shared.profile.current')}` : item.endDate ? ` — ${String(item.endDate)}` : ''}
										</p>
									</li>
								))}
							</ul>
						</Bloco>
					)}
					{(perfil?.skills.length ?? 0) > 0 && (
						<Bloco titulo={t('shared.profile.skills')}>
							<div className='flex flex-wrap gap-1.5'>
								{perfil!.skills.map((skill) => (
									<span key={skill} className='rounded-md bg-card-alt px-2 py-1 text-[12px] text-text-2'>
										{skill}
									</span>
								))}
							</div>
						</Bloco>
					)}
					{((perfil?.education.length ?? 0) > 0 || (perfil?.languages.length ?? 0) > 0) && (
						<Bloco titulo={t('shared.profile.education')}>
							<div className='flex flex-col gap-2'>
								{perfil!.education.map((item, i) => (
									<p key={i} className='text-[12.5px]'>
										{String(item.degree ?? '—')}
										{item.institution ? (
											<span className='text-muted'> — {String(item.institution)}</span>
										) : null}
									</p>
								))}
								{perfil!.languages.map((item, i) => (
									<p key={`l${i}`} className='flex justify-between text-[12.5px]'>
										<span>{String(item.language ?? '')}</span>
										<span className='text-muted'>{String(item.proficiency ?? '')}</span>
									</p>
								))}
							</div>
						</Bloco>
					)}
					{perfil?.resumeUrl && (
						<a
							href={perfil.resumeUrl}
							target='_blank'
							rel='noopener noreferrer'
							className='rounded-xl border border-border bg-card px-4 py-3 text-[12.5px] text-lime-fg transition-colors hover:border-lime-mid'
						>
							{t('shared.profile.resume')}
						</a>
					)}
				</div>

				<div className='rounded-xl border border-border bg-card p-4'>
					{/* trilha das perguntas: navegação, não placar */}
					<div className='flex flex-wrap gap-1'>
						{perguntas.map((item, i) => (
							<button
								key={item.id}
								onClick={() => setAtual(i)}
								aria-current={i === atual}
								className={cn(
									'font-num h-6 w-6 rounded-md border text-[11.5px] transition-colors',
									i === atual
										? 'border-lime bg-lime text-lime-ink'
										: 'border-border text-text-2 hover:border-lime-mid hover:text-text',
								)}
							>
								{i + 1}
							</button>
						))}
					</div>

					<p className='mt-3 text-[13px] leading-snug'>{pergunta.question}</p>

					<div className='mt-3 max-w-[820px]'>
						<VideoPlayer
							key={pergunta.id}
							src={pergunta.video ?? pergunta.audio}
							kind={pergunta.video ? 'video' : 'audio'}
							skipped={pergunta.skipped}
							captions={pergunta.captionSegments}
							audioFallback={pergunta.audio}
						/>
					</div>

					{pergunta.answer && <Transcricao texto={pergunta.answer} />}

					{visibility?.feedback && pergunta.feedback && (
						<div className='mt-3 rounded-xl bg-card-alt p-3'>
							<p className='text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted'>
								{t('shared.aiFeedback')}
							</p>
							<p className='mt-1.5 text-[12.5px] leading-relaxed text-text-2'>
								{pergunta.feedback}
							</p>
						</div>
					)}

					{/*
					 * Pontos fortes e o que desenvolver JÁ VINHAM no payload quando a
					 * seção de feedback está ligada — eu simplesmente não os desenhava.
					 * O remetente liberava e o destinatário não via.
					 */}
					{visibility?.feedback &&
						((pergunta.strengths?.length ?? 0) > 0 || (pergunta.improvement?.length ?? 0) > 0) && (
							<div className='mt-3 grid gap-3 md:grid-cols-2'>
								{(pergunta.strengths?.length ?? 0) > 0 && (
									<Lista titulo={t('shared.strengths')} itens={pergunta.strengths ?? []} forte />
								)}
								{(pergunta.improvement?.length ?? 0) > 0 && (
									<Lista titulo={t('shared.improvement')} itens={pergunta.improvement ?? []} />
								)}
							</div>
						)}

					{visibility?.analysis && pergunta.recommendation && (
						<div className='mt-3 rounded-xl bg-card-alt p-3'>
							<p className='text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted'>
								{t('shared.recommendation')}
							</p>
							<p className='mt-1.5 text-[12.5px] leading-relaxed text-text-2'>
								{pergunta.recommendation}
							</p>
						</div>
					)}
				</div>
				</div>
			)}
		</Page>
	)
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
	return (
		<div className='rounded-xl border border-border bg-card p-4'>
			<p className='mb-2.5 text-[13px] font-semibold'>{titulo}</p>
			{children}
		</div>
	)
}

function Lista({ titulo, itens, forte }: { titulo: string; itens: string[]; forte?: boolean }) {
	return (
		<div className='rounded-xl bg-card-alt p-3'>
			<p className='text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted'>{titulo}</p>
			<ul className='mt-1.5 flex flex-col gap-1'>
				{itens.map((item) => (
					<li key={item} className='flex gap-1.5 text-[12px] leading-relaxed text-text-2'>
						<span className={cn('mt-1.5 h-1 w-1 shrink-0 rounded-full', forte ? 'bg-lime-mid' : 'bg-muted')} />
						{item}
					</li>
				))}
			</ul>
		</div>
	)
}

/** O que a pessoa disse, transcrito — fechado, porque quem quer ouve o vídeo. */
function Transcricao({ texto }: { texto: string }) {
	const { t } = useTranslation()
	const [aberta, setAberta] = useState(false)
	return (
		<div className='mt-3'>
			<button
				type='button'
				onClick={() => setAberta((v) => !v)}
				className='text-[12px] text-muted transition-colors hover:text-text'
			>
				{t(aberta ? 'shared.hideTranscript' : 'shared.showTranscript')}
			</button>
			{aberta && (
				<p className='mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-card-alt p-3 text-[12.5px] leading-relaxed text-text-2'>
					{texto}
				</p>
			)}
		</div>
	)
}
