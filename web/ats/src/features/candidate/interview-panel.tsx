import { AlertTriangle, CheckCircle2, Languages } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/cn'

import { AuthenticityCard, type Authenticity } from './authenticity-card'
import { QuestionPanel, type DossierQuestion } from './question-panel'

/** "pt-BR" não diz nada para quem não é dev; "Português" diz. */
function languageName(code: string): string {
	const base = code.split(/[-_]/)[0].toLowerCase()
	if (base === 'pt') return 'Português'
	if (base === 'en') return 'English'
	return code.toUpperCase()
}

interface Competency {
	name: string
	score: number
	strengths: string[]
	gaps: string[]
	critical: boolean
}

/** A escala inteira num matiz só vira decoração; a cor tem que significar. */
function scoreFill(score: number): string {
	if (score >= 8) return 'bg-lime'
	if (score >= 6.5) return 'bg-data-cyan'
	if (score >= 5) return 'bg-data-yellow'
	return 'bg-data-pink'
}

/**
 * Bloco da entrevista com IA — o coração da tela e o que a Coploy vende.
 *
 * A nota vem SEMPRE com contexto: sozinha, "8,6" não diz se é bom. Contra a
 * média da vaga, diz. É a diferença entre mostrar um número e sustentar uma
 * decisão.
 */
export function InterviewPanel({
	jobAppliedId,
	userId,
	score,
	jobAverage,
	jobCandidates = 0,
	questionCount,
	competencies,
	questions,
	summary,
	recommendation,
	strengths,
	developmentAreas,
	authenticity = null,
	translations = [],
	translationsByLanguage,
	onRequestTranslation,
	translating = false,
}: {
	/** Par (candidato, vaga) — sem ele o cartão de autenticidade vira só leitura. */
	jobAppliedId?: string | null
	userId?: string | null
	score: number | null
	jobAverage: number | null
	/** Quantos candidatos DESTA vaga já têm nota — inclui o que está na tela. */
	jobCandidates?: number
	questionCount: number
	competencies: Competency[]
	questions: DossierQuestion[]
	summary: string | null
	recommendation: string | null
	strengths: string[]
	developmentAreas: string[]
	authenticity?: Authenticity | null
	translations?: string[]
	/** Resultado traduzido por idioma — alimenta o seletor do topo. */
	translationsByLanguage?: Record<
		string,
		{
			summary: string | null
			recommendation: string | null
			strengths: string[]
			developmentAreas: string[]
			questions: Array<{
				feedback: string | null
				strengths: string[]
				improvements: string[]
				authenticity?: DossierQuestion['authenticity']
			}>
			authenticity?: Authenticity | null
		}
	>
	/**
	 * Dispara a tradução de um idioma ainda não gerado.
	 *
	 * O cache do Firestore cobre feedback e recomendação, mas a autenticidade só
	 * entrou no pipeline agora — entrevista antiga tem tradução parcial. Em vez
	 * de mostrar metade da tela em inglês, a tela pede a tradução ao core, que
	 * gera uma vez e guarda.
	 */
	onRequestTranslation?: (language: string) => void
	translating?: boolean
}) {
	const { t } = useTranslation()
	/** `null` = idioma original da entrevista. */
	const [language, setLanguage] = useState<string | null>(null)

	/*
	 * Trocar o idioma troca o RESULTADO INTEIRO: resumo, recomendação, pontos
	 * fortes, desenvolvimento e o feedback de cada pergunta. Traduzir só o topo
	 * deixaria a tela bilíngue no meio da leitura.
	 */
	const translated = language ? translationsByLanguage?.[language] : null
	// autenticidade traduzida é o último bloco a chegar; sem ela, pede ao core
	const shownAuthenticity = translated?.authenticity ?? authenticity
	const shownSummary = translated?.summary ?? summary
	const shownRecommendation = translated?.recommendation ?? recommendation
	const shownStrengths = translated && translated.strengths.length > 0 ? translated.strengths : strengths
	const shownDevelopment =
		translated && translated.developmentAreas.length > 0
			? translated.developmentAreas
			: developmentAreas
	const shownQuestions = translated
		? questions.map((question, index) => {
				const item = translated.questions[index]
				if (!item) return question
				return {
					...question,
					feedback: item.feedback ?? question.feedback,
					strengths: item.strengths.length > 0 ? item.strengths : question.strengths,
					improvements: item.improvements.length > 0 ? item.improvements : question.improvements,
					// as observações da aba "IA" vivem aqui; sem isto só elas ficavam em inglês
					authenticity: item.authenticity ?? question.authenticity,
				}
			})
		: questions

	/*
	 * Comparar exige com QUEM comparar. Com um único candidato pontuado, a
	 * "média da vaga" é a nota dele mesmo — dizer que está abaixo dela é
	 * matematicamente impossível e destrói a confiança no resto da tela.
	 *
	 * A faixa de ±0,2 existe porque nota de IA não tem essa precisão: 8,8 contra
	 * média 8,9 é empate, não "abaixo".
	 */
	const comparable = score !== null && jobAverage !== null && jobCandidates >= 2
	const delta = comparable ? score - (jobAverage as number) : 0
	const verdict = !comparable ? null : delta > 0.2 ? 'above' : delta < -0.2 ? 'below' : 'onPar'

	return (
		<div className='flex flex-col gap-4'>
			<section className='rounded-xl border border-border bg-card'>
				<header className='flex items-center gap-2 border-b border-border-soft px-4 py-2.5'>
					<span className='h-1.5 w-1.5 rounded-full bg-lime' />
					<h2 className='flex-1 text-[13px] font-medium'>{t('candidate.aiInterview')}</h2>
					{/*
					 * Idioma do resultado: controle segmentado, não popover.
					 *
					 * São duas ou três opções e a escolha muda a tela INTEIRA — deixar
					 * o estado atual escondido atrás de um clique faz o recrutador
					 * duvidar se está lendo o original ou a tradução. Popover ficou só
					 * no player, onde a barra é estreita e as opções são muitas.
					 */}
					{translations.length > 0 && (
						<div className='flex items-center gap-0.5 rounded-lg bg-card-alt p-0.5'>
							<Languages size={12} className='ml-1 mr-0.5 text-muted' />
							<button
								onClick={() => setLanguage(null)}
								aria-pressed={language === null}
								className={cn(
									'rounded-md px-2 py-0.5 text-[11.5px] font-medium transition-colors',
									language === null
										? 'bg-lime text-lime-ink shadow-sm'
										: 'text-text-2 hover:text-text',
								)}
							>
								{t('candidate.original')}
							</button>
							{translations.map((code) => (
								<button
									key={code}
									onClick={() => {
										setLanguage(code)
										/*
										 * Pede SEMPRE: quem sabe se o cache está completo é o
										 * servidor, que versiona o payload e regera quando a
										 * lista de campos traduzidos cresceu.
										 */
										onRequestTranslation?.(code)
									}}
									aria-pressed={language === code}
									className={cn(
										'rounded-md px-2 py-0.5 text-[11.5px] font-medium transition-colors',
										language === code
											? 'bg-lime text-lime-ink shadow-sm'
											: 'text-text-2 hover:text-text',
									)}
								>
									{translating && language === code
										? t('candidate.translatingShort')
										: languageName(code)}
								</button>
							))}
						</div>
					)}

					<span className='font-num text-[11px] text-muted'>
						{t('candidate.questionCount', { count: questionCount })}
					</span>
				</header>

				<div className='flex flex-wrap items-start gap-4 p-4'>
					<div className='shrink-0'>
						<span className='font-num text-[40px] font-semibold leading-none tracking-tight'>
							{score !== null ? score.toFixed(1).replace('.', ',') : '—'}
						</span>
						<span className='font-num text-[13px] text-muted'>/10</span>
					</div>

					<div className='min-w-[200px] flex-1'>
						<p className='text-[12.5px] text-text-2'>
							{verdict
								? t(`candidate.${verdict}Average`, {
										average: (jobAverage as number).toFixed(1).replace('.', ','),
										count: jobCandidates,
									})
								: t(
										score !== null && jobCandidates <= 1
											? 'candidate.onlyScored'
											: 'candidate.noBenchmark',
									)}
						</p>

						{/* a média da vaga vira um traço na régua: comparação sem tabela */}
						{score !== null && (
							<div className='relative mt-2.5 h-2 rounded-full bg-data-track'>
								<span
									className={cn('absolute inset-y-0 left-0 rounded-full', scoreFill(score))}
									style={{ width: `${Math.min(score * 10, 100)}%` }}
								/>
								{comparable && (
									<span
										className='absolute inset-y-[-3px] w-px bg-text'
										style={{ left: `${Math.min(jobAverage * 10, 100)}%` }}
										title={t('candidate.jobAverageMark')}
									/>
								)}
							</div>
						)}
					</div>
				</div>

				{competencies.length > 0 && (
					<div className='flex flex-col gap-2 border-t border-border-soft px-4 py-3'>
						{competencies.map((competency) => (
							<div key={competency.name} className='flex items-center gap-3'>
								<span className='w-[160px] shrink-0 truncate text-[12px] text-text-2'>
									{competency.name}
									{competency.critical && (
										<span className='ml-1.5 text-[10px] text-muted'>
											{t('candidate.criticalShort')}
										</span>
									)}
								</span>
								<span className='h-2 flex-1 rounded-full bg-data-track'>
									<span
										className={cn('block h-2 rounded-full', scoreFill(competency.score))}
										style={{
											width: `${Math.min(competency.score * 10, 100)}%`,
										}}
									/>
								</span>
								<span className='font-num w-9 shrink-0 text-right text-[12px] font-medium'>
									{competency.score.toFixed(1).replace('.', ',')}
								</span>
							</div>
						))}
					</div>
				)}
			</section>

			<AuthenticityCard data={shownAuthenticity} userId={userId} jobAppliedId={jobAppliedId} />

			<QuestionPanel questions={shownQuestions} language={language} />

			{(summary || strengths.length > 0 || developmentAreas.length > 0) && (
				<section className='rounded-xl border border-border bg-card'>
					<header className='border-b border-border-soft px-4 py-2.5'>
						<h2 className='text-[13px] font-medium'>{t('candidate.aiReading')}</h2>
					</header>
					<div className='flex flex-col gap-2.5 p-4'>
						{shownSummary && (
							<p className='text-[12.5px] leading-relaxed text-text-2'>{shownSummary}</p>
						)}
						{shownStrengths.map((item) => (
							<p key={item} className='flex items-start gap-2 text-[12px]'>
								<CheckCircle2 size={13} className='mt-0.5 shrink-0 text-lime-fg' />
								<span>
									<span className='font-medium'>{t('candidate.strength')}: </span>
									<span className='text-text-2'>{item}</span>
								</span>
							</p>
						))}
						{shownDevelopment.map((item) => (
							<p key={item} className='flex items-start gap-2 text-[12px]'>
								<AlertTriangle size={13} className='mt-0.5 shrink-0 text-amber' />
								<span>
									<span className='font-medium'>{t('candidate.attention')}: </span>
									<span className='text-text-2'>{item}</span>
								</span>
							</p>
						))}
						{shownRecommendation && (
							<p className='mt-1 border-t border-border-soft pt-3 text-[12px]'>
								<span className='text-muted'>{t('candidate.recommendation')}: </span>
								<span className='font-medium text-lime-fg'>{shownRecommendation}</span>
							</p>
						)}
					</div>
				</section>
			)}
		</div>
	)
}
