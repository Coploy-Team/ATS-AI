import { Link, useParams } from '@tanstack/react-router'
import { Lock, Mail, MapPin, Phone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { InterviewPanel } from '@/features/candidate/interview-panel'
import { cn } from '@/lib/cn'
import { Skeleton, SkeletonCard } from '@/ui/skeleton'
import { Page } from '@/ui/page'

import { MarketRead, type InterviewTags } from './market-read'

/**
 * Talento do pool de hunting.
 *
 * Reusa o `InterviewPanel` do dossiê: a entrevista é a mesma evidência, só
 * muda de onde a pessoa veio. Duplicar o painel faria as duas telas
 * divergirem na primeira melhoria.
 *
 * Contato pode vir mascarado quando o perfil não foi desbloqueado — a tela
 * mostra o cadeado em vez de um campo vazio, senão parece dado faltando.
 */
/** Número de verdade ou nada — sem confundir zero com ausência. */
function toScore(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null
	const parsed = Number(String(value).replace(',', '.'))
	return Number.isFinite(parsed) ? parsed : null
}

export function TalentPage() {
	const { t } = useTranslation()
	const { userId } = useParams({ from: '/app/hunting/$userId' })
	const { data, isLoading, isError } = empresa.useGetPublicInterviewsUserUserId(userId)
	const [selected, setSelected] = useState(0)

	if (isLoading) {
		return (
			<div className='flex flex-col gap-4 p-6'>
				<div className='flex items-center gap-3'>
					<Skeleton className='h-12 w-12 rounded-full' />
					<div className='flex flex-col gap-2'>
						<Skeleton className='h-4 w-44' />
						<Skeleton className='h-3 w-28' />
					</div>
				</div>
				<div className='grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)]'>
					<SkeletonCard lines={3} />
					<div className='flex flex-col gap-4'>
						<SkeletonCard lines={4} />
						<SkeletonCard lines={6} />
					</div>
				</div>
			</div>
		)
	}

	// o tipo gerado é união 200|404 — estreitar pela chave é mais honesto que
	// assertar o 200
	const body = data?.data as { candidate?: Record<string, unknown> } | undefined
	const candidate = body?.candidate

	if (isError || !candidate) {
		return (
			<div className='flex h-full flex-col items-center justify-center gap-2 text-center'>
				<p className='text-[13px]'>{t('hunting.detailError')}</p>
				<Link to='/hunting' className='text-[12px] text-lime-fg hover:underline'>
					{t('hunting.backToPool')}
				</Link>
			</div>
		)
	}

	const name = String(candidate.name ?? '—')
	/**
	 * A entrevista vive em `jobsApplied`, não em `interviews`. Este último é a
	 * projeção `companyInterviews` (resumo do candidato na vaga) e NÃO carrega
	 * `avaliacaoFinal` nem `interview.info` — foi por isso que a tela abria com
	 * "0 perguntas" e nota vazia mesmo para quem tem entrevista completa.
	 */
	const applications = Array.isArray(candidate.jobsApplied)
		? (candidate.jobsApplied as Array<Record<string, unknown>>)
		: []

	/*
	 * As entrevistas do espelho são a espinha da tela: existem mesmo quando o
	 * `jobsApplied` original sumiu (candidato de outra empresa, doc legado
	 * apagado). Cada uma vira uma aba; o dado completo, quando existe, é
	 * casado por `job_applied_ref`.
	 */
	const mirrors = Array.isArray(candidate.interviews)
		? (candidate.interviews as Array<Record<string, unknown>>)
		: []
	const current = mirrors[Math.min(selected, Math.max(mirrors.length - 1, 0))] ?? null
	const tags = (current?.interview_tags ?? null) as InterviewTags | null

	/*
	 * Casar SÓ pela entrevista selecionada.
	 *
	 * O fallback anterior pegava "a primeira candidatura com conteúdo" quando a
	 * do espelho não estava na lista — então clicar na aba "QA" podia exibir as
	 * perguntas e o vídeo da entrevista de ".NET", sem nenhum aviso. Mostrar a
	 * resposta de outra entrevista é pior que não mostrar: quem lê acredita.
	 *
	 * Sem `job_applied_ref` (espelho legado) o fallback ainda vale — ali não há
	 * seleção a respeitar.
	 */
	const latestApplication = current?.job_applied_ref
		? applications.find((item) => item.id === current.job_applied_ref)
		: applications.find((item) => item.avaliacaoFinal || item.interview)
	const latest = (latestApplication?.interview ?? {}) as Record<string, unknown>

	/*
	 * O espelho existe mesmo quando o `jobsApplied` sumiu (candidato de outra
	 * empresa, doc legado apagado). Nesse caso dá para mostrar a leitura de
	 * mercado, mas não a gravação — e a tela precisa dizer isso, senão parece
	 * defeito.
	 */
	const recordingUnavailable = Boolean(current) && !latestApplication

	const evaluation = (latestApplication?.avaliacaoFinal ?? {}) as {
		competencias_criticas?: Array<Record<string, unknown>>
		competencias_adicionais?: Array<Record<string, unknown>>
		resumo?: string
		generalRecomendation?: string
		recomendacoes?: {
			pontos_fortes?: string[]
			areas_desenvolvimento?: string[]
		}
	}

	const competencies = [
		...(evaluation.competencias_criticas ?? []).map((item) => ({
			item,
			critical: true,
		})),
		...(evaluation.competencias_adicionais ?? []).map((item) => ({
			item,
			critical: false,
		})),
	].map(({ item, critical }) => {
		const raw = Number(item.pontuacao ?? item.score ?? 0)
		return {
			name: String(item.nome ?? '—'),
			// dado antigo grava 0–1; sem normalizar a tela mostra "0,8"
			score: raw > 0 && raw <= 1 ? Number((raw * 10).toFixed(1)) : Number(raw.toFixed(1)),
			strengths: (item.pontos_fortes as string[]) ?? [],
			gaps: (item.pontos_desenvolvimento as string[]) ?? [],
			critical,
		}
	})

	const questions = Array.isArray(latest?.info)
		? (latest.info as Array<Record<string, unknown>>).map((item, index) => ({
				id: String(item.id ?? `q-${index}`),
				question: String(item.question ?? ''),
				score: item.score === undefined ? null : Number(item.score),
				feedback: (item.feedback as string) ?? null,
				analyze: (item.analyze as string) ?? null,
				video: (item.video as string) || null,
				audio: (item.audio as string) || null,
				skipped: item.pulou_a_pergunta === true,
				answer: (item.answer as string) ?? null,
				captions:
					(item.captionSegments as Array<{
						start: number
						end: number
						text: string
					}>) ?? null,
				captionLanguages: Object.entries(
					(item.captionTranslations ?? {}) as Record<string, unknown>,
				)
					.filter(([, value]) => Array.isArray(value) && value.length > 0)
					.map(([language]) => language),
				strengths: (item.strengths as string[]) ?? [],
				improvements: (item.improvement as string[]) ?? [],
			}))
		: []

	const rawScore = latest.score ?? current?.score ?? candidate.averageScore ?? candidate.score
	/*
	 * `Number(...) || null` engolia a nota ZERO — `0 || null` é `null`, então o
	 * candidato pior avaliado da base aparecia sem nota, como se a entrevista
	 * não tivesse sido corrigida. Zero é uma nota, e é justamente a que o
	 * recrutador precisa ver.
	 */
	const score = toScore(rawScore)
	const locked = candidate.unlocked === false

	const location = [candidate.city, candidate.state, candidate.country]
		.map((part) => (typeof part === 'string' ? part.trim() : ''))
		.filter((part) => part && part !== '-')
		.join(', ')

	return (
		<Page
			title={name}
			subtitle={
				<>
					<Link to='/hunting' className='text-muted transition-colors hover:text-text'>
						{t('hunting.backToPool')}
					</Link>
					{typeof candidate.occupation === 'string' && candidate.occupation && (
						<>
							<span className='mx-1.5 text-muted'>/</span>
							{candidate.occupation}
						</>
					)}
				</>
			}
		>
			<div className='grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]'>
				<div className='flex flex-col gap-4'>
					<section className='rounded-xl border border-border bg-card p-4'>
						<div className='flex items-start gap-3'>
							{typeof candidate.photo_url === 'string' && candidate.photo_url ? (
								<img
									src={candidate.photo_url}
									alt=''
									width={48}
									height={48}
									className='h-12 w-12 shrink-0 rounded-xl object-cover'
								/>
							) : (
								<span className='font-display flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-lime-soft text-[16px] font-semibold text-lime-fg'>
									{name.slice(0, 2).toUpperCase()}
								</span>
							)}
							<div className='min-w-0'>
								<p className='truncate text-[14px] font-medium'>{name}</p>
								{location && (
									<p className='mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-muted'>
										<MapPin size={11} /> {location}
									</p>
								)}
							</div>
						</div>

						<div className='mt-3 flex flex-col gap-1.5 border-t border-border-soft pt-3 text-[12px]'>
							<ContactRow
								icon={<Mail size={12} />}
								value={typeof candidate.email === 'string' ? candidate.email : null}
								locked={locked}
								lockedLabel={t('hunting.lockedContact')}
							/>
							<ContactRow
								icon={<Phone size={12} />}
								value={typeof candidate.phone_number === 'string' ? candidate.phone_number : null}
								locked={locked}
								lockedLabel={t('hunting.lockedContact')}
							/>
						</div>
					</section>

					{typeof candidate.professional_experience === 'string' &&
						candidate.professional_experience && (
							<section className='rounded-xl border border-border bg-card p-4'>
								<h2 className='font-display mb-2 text-[13px] font-semibold'>
									{t('candidate.experience')}
								</h2>
								<p className='whitespace-pre-line text-[12px] leading-relaxed text-text-2'>
									{candidate.professional_experience}
								</p>
							</section>
						)}
				</div>

				<div className='flex min-w-0 flex-col gap-4'>
					{mirrors.length > 1 && (
						<div className='flex flex-wrap gap-1.5'>
							{mirrors.map((mirror, index) => (
								<button
									key={String(mirror.id ?? index)}
									onClick={() => setSelected(index)}
									className={cn(
										'rounded-lg border px-2.5 py-1 text-left text-[11.5px] transition-colors',
										index === selected
											? 'border-lime bg-lime-soft text-lime-fg'
											: 'border-border text-text-2 hover:bg-hover hover:text-text',
									)}
								>
									{String(mirror.job_name ?? t('hunting.untitledInterview'))}
									{typeof mirror.date === 'string' && (
										<span className='font-num ml-1.5 text-[10.5px] text-muted'>
											{new Date(mirror.date).toLocaleDateString()}
										</span>
									)}
								</button>
							))}
						</div>
					)}

					{tags && <MarketRead tags={tags} />}

					{/*
					 * Sem perguntas, competências nem resumo o painel viraria uma
					 * moldura vazia — no hunting isso é comum, porque o dado detalhado
					 * pode ter sido apagado e sobrar só a leitura do espelho.
					 */}
					{recordingUnavailable && (
						<p className='rounded-xl border border-border bg-card px-4 py-3 text-[12.5px] text-text-2'>
							{t('hunting.recordingUnavailable')}
						</p>
					)}

					{/*
					 * Coluna vazia parece defeito.
					 *
					 * No hunting o detalhe da entrevista só aparece para quem tem acesso
					 * a ele — e quando não tem, a tela mostrava tabs, contato e mais
					 * NADA. O Henrique leu como bug ("fica parecendo bug"), e leu certo:
					 * ausência sem explicação é indistinguível de falha.
					 */}
					{!tags &&
						questions.length === 0 &&
						competencies.length === 0 &&
						!evaluation.resumo && (
							<div className='rounded-xl border border-border bg-card px-4 py-8 text-center'>
								<p className='text-[13px] font-medium'>{t('hunting.lockedTitle')}</p>
								<p className='mx-auto mt-1 max-w-[440px] text-[12.5px] leading-relaxed text-text-2'>
									{t('hunting.lockedHint')}
								</p>
							</div>
						)}

					{(questions.length > 0 || competencies.length > 0 || evaluation.resumo) && (
						<InterviewPanel
							score={score}
							jobAverage={null}
							jobCandidates={0}
							questionCount={questions.length}
							competencies={competencies}
							questions={questions}
							summary={evaluation.resumo ?? null}
							recommendation={evaluation.generalRecomendation ?? null}
							strengths={evaluation.recomendacoes?.pontos_fortes ?? []}
							developmentAreas={evaluation.recomendacoes?.areas_desenvolvimento ?? []}
							translations={Object.keys((latest.translationCache ?? {}) as Record<string, unknown>)}
						/>
					)}
				</div>
			</div>
		</Page>
	)
}

function ContactRow({
	icon,
	value,
	locked,
	lockedLabel,
}: {
	icon: React.ReactNode
	value: string | null
	locked: boolean
	lockedLabel: string
}) {
	if (!value && !locked) return null

	return (
		<p className={cn('inline-flex items-center gap-1.5', locked ? 'text-muted' : 'text-text-2')}>
			{locked ? <Lock size={12} /> : icon}
			<span className='truncate'>{locked ? lockedLabel : value}</span>
		</p>
	)
}
