import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

import type { JobDraft } from './job-form-page'

/**
 * Perguntas da entrevista IA.
 *
 * Geração por IA primeiro, edição depois: escrever cinco boas perguntas do
 * zero é o passo onde o recrutador desiste, e a Coploy já tem o gerador. O
 * que ele produz é ponto de partida editável, nunca resultado final — por isso
 * cada pergunta entra numa linha que dá pra reescrever ou apagar.
 */
/** Ponto em que a pesquisa registra ~73% de abandono. */
const CLIFF_MINUTES = 15

export function QuestionsStep({
	draft,
	onChange,
}: {
	draft: JobDraft
	onChange: (questions: JobDraft['jobQuestions']) => void
}) {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const generate = empresa.usePostIaQuestions()
	const [failed, setFailed] = useState(false)
	/*
	 * Quantas gerar. A API já aceitava `numero` e a tela mandava 5 fixo — a
	 * escolha existia no backend e não chegava a quem decide. Cinco continua
	 * sendo o default porque é o que cabe nos 15 minutos que a maioria conclui,
	 * mas processo de estágio e processo de C-level não pedem o mesmo número.
	 */
	const [howMany, setHowMany] = useState(5)

	/*
	 * Estimativa conservadora: ~2 min por resposta em vídeo (gravar, ouvir a
	 * pergunta, pensar) + 3 min de setup de câmera e microfone. Subestimar aqui
	 * seria pior que não estimar — daria conforto falso.
	 */
	const estimatedMinutes = Math.round(draft.jobQuestions.length * 2 + 3)

	async function generateQuestions() {
		setFailed(false)
		try {
			const response = await generate.mutateAsync({
				data: {
					cargo: draft.jobName,
					nivel: draft.carrerLevel,
					descricao: draft.jobDescription,
					responsabilidades: draft.jobResponsabilities,
					requisitos: draft.jobRequirements,
					idioma: draft.language,
					numero: howMany,
				},
			})
			// o tipo gerado é união 200|400 — estreitar pela presença da chave é
			// mais honesto do que assertar o 200
			const body = response.data as { perguntas?: string[] }
			const generated = body.perguntas ?? []
			if (generated.length === 0) {
				setFailed(true)
				return
			}
			/*
			 * SUBSTITUI o conjunto, não acrescenta.
			 *
			 * Eu tinha feito somar, com a justificativa de não apagar o que a pessoa
			 * escreveu à mão. Errado: pedir 3 e clicar de novo devolvia 6, e ninguém
			 * pede "mais três" — pede outro conjunto de três. É a regra da v1 e a
			 * única que faz o número escolhido significar alguma coisa.
			 */
			onChange(generated.map((question: string) => ({ question })))
		} catch {
			setFailed(true)
		}
	}

	function update(index: number, question: string) {
		onChange(draft.jobQuestions.map((item, i) => (i === index ? { ...item, question } : item)))
	}

	return (
		<div className='flex flex-col gap-3'>
			<p className='rounded-lg border border-border bg-surface px-3 py-2 text-[12px] leading-snug text-text-2'>
				{t('jobForm.hints.questions')}
			</p>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='text-[12px] text-text-2'>
					{t(features.motor ? 'jobForm.questionsHelp' : 'jobForm.questionsHelpManual')}
				</p>
				{/* geração usa o ai-engine — sem o Motor o botão falharia sempre */}
				{features.motor && (
				<div className='flex items-center gap-2'>
					<label className='flex items-center gap-1.5 text-[12px] text-text-2'>
						{t('jobForm.howMany')}
						<select
							value={howMany}
							onChange={(event) => setHowMany(Number(event.target.value))}
							className='font-num h-8 rounded-lg border border-border bg-surface px-2 text-[12.5px]'
						>
							{/*
							 * 3 a 15, a mesma régua da v1 (`Array.from({length: 13}, i => i+3)`).
							 * Eu tinha posto quatro saltos arbitrários — quem quer 8 ou 12
							 * não tinha como pedir.
							 */}
							{Array.from({ length: 13 }, (_, i) => i + 3).map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					</label>
				<Button
					variant='secondary'
					size='sm'
					disabled={!draft.jobName.trim() || generate.isPending}
					onClick={() => void generateQuestions()}
				>
					{generate.isPending ? (
						<Loader2 size={12} className='animate-spin' />
					) : (
						<Sparkles size={12} />
					)}
					{generate.isPending ? t('jobForm.generating') : t('jobForm.generateQuestions')}
					</Button>
				</div>
				)}
			</div>

			{failed && <p className='text-[12px] text-danger'>{t('jobForm.generateError')}</p>}

			{draft.jobQuestions.length === 0 && (
				<p className='rounded-lg border border-border bg-surface px-3 py-6 text-center text-[12px] text-muted'>
					{t(features.motor ? 'jobForm.questionsEmpty' : 'jobForm.questionsEmptyManual')}
				</p>
			)}

			<ul className='flex flex-col gap-2'>
				{draft.jobQuestions.map((item, index) => (
					<li key={index} className='flex items-start gap-2'>
						<span className='font-num mt-2.5 w-5 shrink-0 text-[11px] text-muted'>
							{index + 1}
						</span>
						<textarea
							value={item.question}
							rows={2}
							onChange={(e) => update(index, e.target.value)}
							className='flex-1 rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed text-text'
						/>
						<button
							onClick={() => onChange(draft.jobQuestions.filter((_, i) => i !== index))}
							aria-label={t('jobForm.questionRemove')}
							className='mt-2 rounded p-1 text-muted transition-colors hover:text-danger'
						>
							<Trash2 size={13} />
						</button>
					</li>
				))}
			</ul>

			{/*
			 * Time-box (V2-606).
			 *
			 * ~73% dos candidatos abandonam depois de 15 minutos. O número de
			 * perguntas é a variável que decide isso, e quem monta a vaga não tem
			 * como estimar de cabeça — então a tela estima. Passou do teto, o
			 * aviso muda de tom; nunca bloqueia, porque há processo em que vale a
			 * pena. O que não pode é a decisão ser tomada sem o dado.
			 */}
			{draft.jobQuestions.length > 0 && (
				<p
					className={cn(
						'rounded-lg border px-3 py-2 text-[12px]',
						estimatedMinutes > CLIFF_MINUTES
							? 'border-border bg-danger-soft text-danger'
							: 'border-border bg-card-alt text-text-2',
					)}
				>
					{estimatedMinutes > CLIFF_MINUTES
						? t('jobForm.timeBoxOver', { minutes: estimatedMinutes })
						: t('jobForm.timeBoxOk', { minutes: estimatedMinutes })}
				</p>
			)}

			<Button
				variant='secondary'
				size='sm'
				className='w-fit'
				onClick={() => onChange([...draft.jobQuestions, { question: '' }])}
			>
				<Plus size={12} /> {t('jobForm.questionAdd')}
			</Button>
		</div>
	)
}
