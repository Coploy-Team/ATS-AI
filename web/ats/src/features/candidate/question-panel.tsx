import { Captions, FileText, ShieldQuestion, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import { VideoPlayer } from './video-player'

export interface DossierQuestion {
	id: string
	question: string
	score: number | null
	feedback: string | null
	analyze: string | null
	video: string | null
	audio: string | null
	skipped: boolean
	answer: string | null
	captions: Array<{ start: number; end: number; text: string }> | null
	captionLanguages: string[]
	captionsByLanguage?: Record<string, Array<{ start: number; end: number; text: string }>>
	strengths: string[]
	improvements: string[]
	/** Autenticidade desta resposta — métricas 0–1 e o que o motor observou. */
	authenticity?: {
		metrics: {
			naturalness: number | null
			personalization: number | null
			complexity: number | null
			linguisticPatterns: number | null
			context: number | null
		}
		observations: string[]
	} | null
}

type Tab = 'analysis' | 'ai' | 'transcript' | 'captions'

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60)
	const s = Math.floor(seconds % 60)
	return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Resposta a resposta.
 *
 * O que estava faltando aqui é o que a Coploy de fato vende: a pergunta
 * inteira (estava truncada, e enunciado cortado esconde justamente o que foi
 * pedido), a NOTA daquela resposta, a transcrição do que a pessoa disse, as
 * legendas com marcação de tempo e os idiomas já traduzidos.
 *
 * As abas existem porque as três leituras não competem: análise é o veredito
 * da IA, transcrição é a prova bruta, legenda é para acompanhar o vídeo. Quem
 * confere um trecho específico quer a legenda; quem revisa a decisão quer a
 * análise.
 */
export function QuestionPanel({
	questions,
	language,
}: {
	questions: DossierQuestion[]
	/** Idioma escolhido no topo — a legenda acompanha, não fica em outro idioma. */
	language?: string | null
}) {
	const { t } = useTranslation()
	const [active, setActive] = useState(0)
	const [tab, setTab] = useState<Tab>('analysis')
	const question = questions[active]

	const availableTabs = useMemo(() => {
		if (!question) return [] as Tab[]
		const tabs: Tab[] = []
		// campos novos podem não existir se o core estiver numa versão anterior
		if (question.analyze || question.feedback || (question.strengths ?? []).length > 0) {
			tabs.push('analysis')
		}
		if (question.authenticity) tabs.push('ai')
		if (question.answer) tabs.push('transcript')
		if (question.captions && question.captions.length > 0) tabs.push('captions')
		return tabs
	}, [question])

	// aba que não existe pra esta pergunta cai na primeira disponível
	const currentTab = availableTabs.includes(tab) ? tab : availableTabs[0]

	/*
	 * Transcrição e legendas seguem o idioma escolhido no topo.
	 *
	 * Antes só a legenda SOBRE o vídeo trocava: o recrutador escolhia PT, via a
	 * legenda em português e ao abrir "Transcrição" encontrava o texto em
	 * inglês. O `answer` não é traduzido pelo motor, mas os segmentos são — e a
	 * transcrição nada mais é do que os segmentos emendados.
	 */
	const track =
		(language ? question?.captionsByLanguage?.[language] : null) ?? question?.captions ?? []
	const transcript =
		language && track.length > 0
			? track.map((segment) => segment.text).join(' ')
			: (question?.answer ?? null)

	if (questions.length === 0) return null

	return (
		<section className='rounded-xl border border-border bg-card'>
			<header className='flex flex-wrap items-start gap-2 border-b border-border-soft px-4 py-3'>
				<span className='font-num mt-0.5 shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-2'>
					P{active + 1}
				</span>
				{/* enunciado INTEIRO: cortar a pergunta esconde o que foi pedido, e
				    sem isso a resposta não pode ser julgada.
				    A nota POR RESPOSTA não aparece de propósito: o recrutador decide
				    pelo conjunto, e um número baixo numa pergunta isolada enviesa a
				    leitura das outras. A nota da entrevista fica no painel acima. */}
				<p className='min-w-0 flex-1 text-[12.5px] leading-snug'>{question?.question}</p>
			</header>

			<div className='p-3'>
				<div className='min-w-0'>
					<VideoPlayer
						src={question?.video ?? question?.audio ?? null}
						kind={question?.video ? 'video' : 'audio'}
						skipped={question?.skipped === true}
						captions={question?.captions ?? null}
						captionsByLanguage={question?.captionsByLanguage}
						preferredLanguage={language}
						// o WebM da webcam não traz duração; o áudio da mesma resposta traz
						audioFallback={question?.video ? (question?.audio ?? null) : null}
					/>

					<div className='mt-2.5 flex flex-wrap items-center gap-1.5'>
						{questions.map((item, index) => (
							<button
								key={item.id}
								onClick={() => setActive(index)}
								title={item.question}
								className={cn(
									'font-num rounded-md border px-2 py-1 text-[11px] transition-colors',
									index === active
										? 'border-lime bg-lime-soft text-lime-fg'
										: 'border-border text-text-2 hover:bg-hover',
									item.skipped && 'text-amber',
								)}
							>
								P{index + 1}
							</button>
						))}
					</div>
				</div>

				<div>
					{availableTabs.length > 0 && (
						<>
							<div className='flex gap-1 border-t border-border-soft px-3 pt-2'>
								{availableTabs.map((name) => (
									<button
										key={name}
										onClick={() => setTab(name)}
										className={cn(
											'inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-2.5 py-1.5 text-[12px] transition-colors',
											currentTab === name
												? 'border-lime text-text'
												: 'border-transparent text-muted hover:text-text',
										)}
									>
										{name === 'analysis' && <Sparkles size={12} />}
										{name === 'ai' && <ShieldQuestion size={12} />}
										{name === 'transcript' && <FileText size={12} />}
										{name === 'captions' && <Captions size={12} />}
										{t(`candidate.tab.${name}`)}
									</button>
								))}
							</div>

							<div className='px-4 py-3'>
								{currentTab === 'analysis' && (
									<div className='flex flex-col gap-2'>
										{(question?.analyze || question?.feedback) && (
											<p className='text-[12px] leading-relaxed text-text-2'>
												{question.analyze || question.feedback}
											</p>
										)}
										{(question?.strengths ?? []).map((item) => (
											<p key={item} className='text-[12px] text-text-2'>
												<span className='font-medium text-lime-fg'>+ </span>
												{item}
											</p>
										))}
										{(question?.improvements ?? []).map((item) => (
											<p key={item} className='text-[12px] text-text-2'>
												<span className='font-medium text-amber'>△ </span>
												{item}
											</p>
										))}
									</div>
								)}

								{/*
								 * Autenticidade DESTA resposta. É o que permite discordar do
								 * veredito global: "44% humano" não diz nada sozinho, mas
								 * "personalização 30% porque não citou nome, data nem métrica"
								 * é um argumento que o recrutador pode conferir na transcrição.
								 */}
								{currentTab === 'ai' && question?.authenticity && (
									<div className='flex flex-col gap-3'>
										<div className='flex flex-col gap-1.5'>
											{(
												[
													['naturalness', question.authenticity.metrics.naturalness],
													['personalization', question.authenticity.metrics.personalization],
													['complexity', question.authenticity.metrics.complexity],
													['linguisticPatterns', question.authenticity.metrics.linguisticPatterns],
													['context', question.authenticity.metrics.context],
												] as const
											)
												.filter(([, value]) => value !== null)
												.map(([key, value]) => {
													// o motor grava 0–1; a tela fala em %
													const percent = Math.round((value as number) * 100)
													return (
														<div key={key} className='flex items-center gap-3'>
															<span className='w-[150px] shrink-0 text-[12px] text-text-2'>
																{t(`candidate.metric.${key}`)}
															</span>
															<span className='h-2 flex-1 rounded-full bg-data-track'>
																<span
																	className={cn(
																		'block h-2 rounded-full',
																		percent >= 70
																			? 'bg-lime'
																			: percent >= 45
																				? 'bg-data-yellow'
																				: 'bg-data-pink',
																	)}
																	style={{ width: `${percent}%` }}
																/>
															</span>
															<span className='font-num w-9 shrink-0 text-right text-[12px] font-medium'>
																{percent}%
															</span>
														</div>
													)
												})}
										</div>

										{question.authenticity.observations.length > 0 && (
											<div className='rounded-lg border border-border-soft bg-card-alt px-3 py-2.5'>
												<p className='mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted'>
													{t('candidate.observations')}
												</p>
												<ul className='flex flex-col gap-1'>
													{question.authenticity.observations.map((item) => (
														<li key={item} className='flex items-start gap-2 text-[12px]'>
															<span className='mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted' />
															<span className='leading-snug text-text-2'>{item}</span>
														</li>
													))}
												</ul>
											</div>
										)}
									</div>
								)}

								{currentTab === 'transcript' && (
									<p className='whitespace-pre-line text-[12px] leading-relaxed text-text-2'>
										{transcript}
									</p>
								)}

								{currentTab === 'captions' && (
									<ul className='flex max-h-[260px] flex-col gap-1 overflow-y-auto'>
										{track.map((segment, index) => (
											<li key={index} className='flex gap-2.5 text-[12px]'>
												<span className='font-num shrink-0 text-muted'>
													{formatTime(segment.start)}
												</span>
												<span className='min-w-0 text-text-2'>{segment.text}</span>
											</li>
										))}
									</ul>
								)}

								{/* a lista de idiomas virou o seletor do player; repetir aqui era ruído */}
							</div>
						</>
					)}
				</div>
			</div>
		</section>
	)
}
