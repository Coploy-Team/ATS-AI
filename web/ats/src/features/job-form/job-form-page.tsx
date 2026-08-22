import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, LayoutTemplate, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { orgUnitPath, orgUnitTree } from '@/lib/org-tree'
import { clearDraft, readDraft, since, writeDraft } from '@/lib/draft-storage'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Card, Page } from '@/ui/page'
import { MarkdownEditor } from '@/ui/markdown-editor'

import { Field, Select, TextArea } from './fields'
import { SearchableSelect } from './searchable-select'
import {
	CATEGORIES,
	CONTRACTS,
	EDUCATION,
	LEVELS,
	MODELS,
	opcoes,
	resolverCategoria,
	resolverOpcao,
} from './job-options'

/** Dica por passo: o que fazer aqui e por que importa. */
function Hint({ children }: { children: React.ReactNode }) {
	return (
		<p className='rounded-lg border border-border bg-surface px-3 py-2 text-[12px] leading-snug text-text-2'>
			{children}
		</p>
	)
}
import { CompetenciesStep } from './competencies-step'
import { QuestionsStep } from './questions-step'
import { SkillsInput } from './skills-input'

export interface JobDraft {
	jobName: string
	identifier: string
	carrerLevel: string
	jobModel: string
	contractType: string
	language: string
	jobDescription: string
	jobRequirements: string
	jobResponsabilities: string
	/** Benefícios em Markdown — vira seção na página pública da vaga. */
	benefits: string
	/** Faixa salarial em texto livre ("R$ 6.000–8.000", "A combinar"). */
	salary: string
	typeInterview: 'interview' | 'evaluation' | 'emotional' | 'whatsapp'
	interviewMode: 'video' | 'voice' | 'whatsapp'
	evaluateLanguage: boolean
	feedbackSlaHours: number
	public: boolean
	jobQuestions: Array<{ question: string; competence?: string }>
	// campos que existiam no dashboard antigo e faltavam aqui
	jobCategories: string
	employmentType: string
	jobHours: string
	mainSkills: string
	screeningObjective: string
	closingDate: string
	country: string
	state: string
	city: string
	educationalRequirement: string
	limitedJobVacancy: boolean
	/** Competências que a entrevista pontua — texto livre, uma por linha (formato da v1). */
	competencias_criticas: string
	competencias_adicionais: string
	expectativas: string
	limitNumberJobVacancies: string
	priority: boolean
	/** Unidade organizacional dona da vaga (V2-502). */
	orgUnitId: string
	/** Valores dos campos que a empresa definiu, por `key`. */
	customFieldValues: Record<string, string>
}

const EMPTY: JobDraft = {
	jobName: '',
	identifier: '',
	carrerLevel: 'Pleno',
	jobModel: 'Remoto',
	contractType: 'CLT',
	language: 'pt-BR',
	jobDescription: '',
	jobRequirements: '',
	jobResponsabilities: '',
	benefits: '',
	salary: '',
	typeInterview: 'interview',
	interviewMode: 'video',
	evaluateLanguage: false,
	// nasce COM régua: a decisão default do produto é ninguém ficar sem resposta
	feedbackSlaHours: 48,
	public: true,
	jobQuestions: [],
	jobCategories: '',
	employmentType: '',
	jobHours: '',
	mainSkills: '',
	screeningObjective: '',
	competencias_criticas: '',
	competencias_adicionais: '',
	expectativas: '',
	closingDate: '',
	country: 'Brasil',
	state: '',
	city: '',
	educationalRequirement: '',
	limitedJobVacancy: false,
	limitNumberJobVacancies: '',
	priority: false,
	orgUnitId: '',
	customFieldValues: {},
}

/*
 * `competencies` entre descrição e entrevista: as competências derivam do texto
 * da vaga (a IA lê descrição, responsabilidades e requisitos) e alimentam a
 * avaliação da entrevista. Fora dessa ordem, o passo geraria do vazio.
 */
const STEPS = ['basics', 'description', 'competencies', 'interview', 'questions', 'review'] as const
/**
 * Sem o Motor não existe entrevista — e um wizard que pede "formato: vídeo"
 * numa edição que não grava vídeo trava quem só quer abrir a vaga (feedback
 * do primeiro uso real da open). O fluxo vira o de qualquer ATS: descrição,
 * requisitos e pronto pra receber candidatura. As etapas de entrevista
 * voltam sozinhas quando o plugin entrar.
 */
const OPEN_STEPS = ['basics', 'description', 'competencies', 'review'] as const
type Step = (typeof STEPS)[number]

/**
 * Criar e editar vaga — absorve o fluxo que no dashboard estava espalhado em
 * 6 páginas.
 *
 * Cinco passos, não um formulário único: o abandono mora no formulário longo.
 * Cada passo pede o que dá pra responder de cabeça, e a descrição tem geração
 * por IA porque escrever JD é onde o recrutador trava.
 *
 * Criar e editar compartilham o MESMO fluxo de propósito: quem edita precisa
 * das mesmas decisões de quem cria, e manter duas telas divergindo é
 * exatamente como a configuração acabou espalhada no dashboard antigo.
 *
 * Vaga nova nasce COM régua de resposta (48h) e pública: o v2 define o padrão
 * em vez de esperar a empresa configurar (design-fundacao §7).
 */
/**
 * Perguntas com id (defeito achado na varredura).
 *
 * O contrato exige `id` em cada pergunta; o rascunho da tela só guardava o
 * texto. Resultado: **criar vaga com perguntas devolvia 400** — e o wizard
 * empurra o recrutador a adicionar perguntas, então o caminho principal do
 * produto quebrava com a mensagem genérica "não foi possível criar a vaga".
 *
 * O id é gerado na hora do envio, não a cada tecla: usar índice ou o texto como
 * id faria a pergunta trocar de identidade ao ser editada ou reordenada — e é
 * por esse id que a resposta do candidato se liga à pergunta.
 */
/**
 * O formulário guarda tudo como string (é o que `<input>` devolve); o servidor
 * valida por TIPO — `number` tem de ser número e `boolean` tem de ser booleano,
 * senão a criação da vaga é recusada. A conversão acontece na saída, não no
 * estado, porque no meio da digitação `"1."` ainda não é número.
 */
function typedCustomFields(
	values: Record<string, string>,
	definitions: Array<{ key: string; type: string }>,
): Record<string, string | number | boolean | null> {
	const typed: Record<string, string | number | boolean | null> = {}
	for (const [key, raw] of Object.entries(values)) {
		if (raw === '') continue
		const type = definitions.find((definition) => definition.key === key)?.type
		if (type === 'number') {
			const parsed = Number(raw)
			typed[key] = Number.isFinite(parsed) ? parsed : raw
		} else if (type === 'boolean') {
			typed[key] = raw === 'true'
		} else {
			typed[key] = raw
		}
	}
	return typed
}

function withQuestionIds(
	questions: Array<{ question: string; competence?: string; id?: string }>,
): Array<{ id: string; question: string }> {
	return questions
		.map((item) => ({ ...item, question: item.question.trim() }))
		// pergunta vazia é ignorada, como a própria tela promete
		.filter((item) => item.question.length > 0)
		.map((item, index) => ({
			id: item.id ?? `q${index + 1}-${Math.random().toString(36).slice(2, 8)}`,
			question: item.question,
		}))
}

export function JobFormPage({ mode = 'create' }: { mode?: 'create' | 'edit' }) {
	const { t, i18n } = useTranslation()
	const navigate = useNavigate()
	const create = empresa.usePostCompaniesJobs()
	const patch = empresa.usePatchCompaniesJobsJobId()

	const editing = mode === 'edit'
	const params = useParams({ strict: false }) as { jobId?: string }
	const jobId = params.jobId ?? ''

	/* definições usadas só para TIPAR o payload — o form em si vive no BasicsStep */
	const { data: defsData } = empresa.useGetCompaniesCustomFields({ entity: 'job' })
	const customFieldDefs =
		((defsData?.data as { fields?: Array<{ key: string; type: string }> } | undefined)?.fields ??
			[]) as Array<{ key: string; type: string }>

	const { data: jobData, isLoading: loadingJob } = empresa.useGetCompaniesJobsSlug(jobId, {
		query: { enabled: editing && Boolean(jobId) },
	})

	/*
	 * Requisição de origem. Chega por `?requisicao=` da tela de Requisições e
	 * viaja até o POST, onde o servidor marca a requisição como consumida — é o
	 * elo que faltava entre "aprovada" e "vaga no ar".
	 */
	const fromRequisition = useSearch({ strict: false }) as { requisicao?: string; titulo?: string }

	/*
	 * Chave por modo: o rascunho de uma vaga nova não pode reaparecer dentro da
	 * edição de outra, e cada vaga em edição tem o seu.
	 */
	const draftKey = editing ? `job:${jobId}` : 'job:new'
	const recovered = useMemo(() => readDraft<JobDraft>(draftKey), [draftKey])

	const { features } = useCapabilities()
	const steps: readonly Step[] = features.motor ? STEPS : OPEN_STEPS

	const [step, setStep] = useState<Step>((recovered?.step as Step) ?? 'basics')

	// Rascunho recuperado numa etapa que esta edição não tem (ex.: parou em
	// "Entrevista" e o Motor saiu) não pode deixar a tela órfã.
	useEffect(() => {
		if (!steps.includes(step)) setStep('basics')
	}, [steps, step])
	const [draft, setDraft] = useState<JobDraft>(() => {
		// rascunho salvo antes desta versão não tem os campos novos — o spread
		// sobre EMPTY evita `undefined` chegando em input controlado
		if (recovered) return { ...EMPTY, ...recovered.draft }
		return fromRequisition.titulo ? { ...EMPTY, jobName: fromRequisition.titulo } : EMPTY
	})
	/** Aviso do rascunho recuperado — dispensável, some ao descartar ou ao salvar. */
	const [restored, setRestored] = useState(Boolean(recovered))
	/** Publicar coloca a vaga no ar: a última tela pergunta antes de fazer. */
	const [confirming, setConfirming] = useState(false)
	const [error, setError] = useState<string | null>(null)
	/** Só hidrata uma vez: rehidratar a cada refetch apagaria o que foi digitado. */
	const [hydrated, setHydrated] = useState(false)

	useEffect(() => {
		// rascunho recuperado tem precedência: ele é mais novo que o servidor
		if (!editing || hydrated || recovered || !jobData?.data) return
		const job = jobData.data as Record<string, unknown>
		const str = (key: string) => (typeof job[key] === 'string' ? (job[key] as string) : '')

		/*
		 * O que está gravado passa por `resolverOpcao` (ver `job-options.ts`):
		 * ele reconhece o rótulo em pt-BR, o slug em inglês da v1 e os slugs que
		 * o v2 chegou a gravar. Valor não reconhecido vira VAZIO, nunca a
		 * primeira opção — cair na primeira era o que fazia a vaga de
		 * "Especialista" abrir como "Estágio" e salvar o nível errado sem
		 * ninguém ter digitado nada.
		 */

		const address = (job.address ?? {}) as { country?: string; state?: string; city?: string }
		/*
		 * A base legada guarda sigla (`br`) num campo rotulado "País", e o form
		 * novo guarda o nome. Mostrar "br" parece defeito; traduzir com
		 * `Intl.DisplayNames` cobre qualquer sigla sem eu manter uma tabela.
		 */
		const countryName = (raw: string) => {
			if (raw.length !== 2) return raw
			try {
				return (
					new Intl.DisplayNames([navigator.language], { type: 'region' }).of(
						raw.toUpperCase(),
					) ?? raw
				)
			} catch {
				return raw
			}
		}
		/* `educationalRequiements` (typo do schema) é lista com um item na prática. */
		const education = Array.isArray(job.educationalRequiements)
			? String((job.educationalRequiements as unknown[])[0] ?? '')
			: ''
		/* o input[type=date] só aceita `YYYY-MM-DD`; a base guarda ISO completo */
		const closingDate = str('closingDate').slice(0, 10)

		setDraft({
			...EMPTY,
			jobName: str('jobName'),
			identifier: str('identifier'),
			carrerLevel: resolverOpcao(str('carrerLevel'), LEVELS),
			jobModel: resolverOpcao(str('jobModel'), MODELS) || EMPTY.jobModel,
			contractType: resolverOpcao(str('contractType'), CONTRACTS) || EMPTY.contractType,
			language: str('language') || EMPTY.language,
			jobDescription: str('jobDescription'),
			jobRequirements: str('jobRequirements'),
			jobResponsabilities: str('jobResponsabilities'),
			benefits: str('benefits'),
			salary: str('salary'),
			typeInterview: (job.typeInterview as JobDraft['typeInterview']) ?? EMPTY.typeInterview,
			interviewMode: (job.interviewMode as JobDraft['interviewMode']) ?? EMPTY.interviewMode,
			evaluateLanguage: job.evaluateLanguage === true,
			feedbackSlaHours: Number(job.feedbackSlaHours ?? EMPTY.feedbackSlaHours),
			public: job.public !== false,

			/*
			 * Daqui pra baixo: 13 campos que a edição simplesmente NÃO lia. A vaga
			 * abria com categoria, jornada, escolaridade, endereço, skills,
			 * competências e número de vagas em branco — e salvar apagava tudo,
			 * porque o PUT manda o rascunho inteiro.
			 */
			jobCategories: resolverCategoria(str('jobCategories')),
			employmentType: str('employmentType'),
			jobHours: str('jobHours'),
			mainSkills: str('mainSkills'),
			screeningObjective: str('screeningObjective'),
			competencias_criticas: str('competencias_criticas'),
			competencias_adicionais: str('competencias_adicionais'),
			expectativas: str('expectativas'),
			closingDate,
			country: countryName(address.country ?? '') || EMPTY.country,
			state: address.state ?? '',
			city: address.city ?? '',
			educationalRequirement: resolverOpcao(education, EDUCATION),
			priority: job.priority === true,
			orgUnitId: str('orgUnitId'),
			customFieldValues: Object.fromEntries(
				Object.entries((job.customFieldValues ?? {}) as Record<string, unknown>).map(
					([key, value]) => [key, value === null || value === undefined ? '' : String(value)],
				),
			),
			limitedJobVacancy: job.limitedJobVacancy === true,
			limitNumberJobVacancies:
				job.limitNumberJobVacancies === undefined || job.limitNumberJobVacancies === null
					? ''
					: String(job.limitNumberJobVacancies),

			jobQuestions: Array.isArray(job.jobQuestions)
				? (job.jobQuestions as Array<{ question?: string }>).map((q) => ({
						question: q.question ?? '',
					}))
				: [],
		})
		setHydrated(true)
	}, [editing, hydrated, jobData])

	/*
	 * Grava a cada mudança, com respiro. `EMPTY` não é gravado: um rascunho
	 * vazio só serviria para o aviso de "rascunho recuperado" aparecer sem nada
	 * dentro.
	 */
	useEffect(() => {
		if (draft === EMPTY) return
		const timer = setTimeout(() => writeDraft(draftKey, draft, step), 500)
		return () => clearTimeout(timer)
	}, [draft, step, draftKey])

	/*
	 * Fechar a aba com trabalho não salvo pede confirmação do navegador. É o
	 * único aviso que funciona fora do app — o rascunho cobre o refresh, mas
	 * fechar a aba merece uma pergunta.
	 */
	useEffect(() => {
		if (draft === EMPTY) return
		function warn(event: BeforeUnloadEvent) {
			event.preventDefault()
			event.returnValue = ''
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [draft])

	const stepIndex = steps.indexOf(step)
	const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) =>
		setDraft((current) => ({ ...current, [key]: value }))

	/*
	 * O QUE FALTA para avançar — a mesma régua da v1 (`JobDetailsForm.handleNext`).
	 *
	 * `canAdvance` era `true` fixo em toda etapa menos a primeira: dava para
	 * atravessar o formulário e publicar uma vaga sem descrição, sem nível e sem
	 * pergunta nenhuma. A API aceita (só `jobName` é obrigatório lá), então nada
	 * reclamava — a vaga nascia inútil, e o candidato entrava numa entrevista sem
	 * perguntas.
	 *
	 * Entrevista por WhatsApp exige menos, porque a conversa é conduzida pelo
	 * assistente e não pelo texto da vaga — é a exceção que a v1 já fazia.
	 */
	const pendencias = ((): string[] => {
		const whatsapp = draft.interviewMode === 'whatsapp'
		if (step === 'basics') {
			const faltando: string[] = []
			if (draft.jobName.trim().length <= 2) faltando.push(t('jobForm.required.jobName'))
			// o nível fica NESTA etapa, junto do campo — exigi-lo lá na frente
			// deixaria a pessoa travada numa tela sem o campo para corrigir
			if (!whatsapp && !draft.carrerLevel.trim()) faltando.push(t('jobForm.required.level'))
			/*
			 * Categoria é obrigatória na v1 (`validateStep(1)`) e não era aqui.
			 * Ela classifica a vaga na carreira e no hunting: sem ela a vaga
			 * nasce fora de qualquer filtro por área.
			 */
			if (!whatsapp && !draft.jobCategories.trim())
				faltando.push(t('jobForm.required.category'))
			return faltando
		}
		if (step === 'description') {
			const faltando: string[] = []
			if (!draft.jobDescription.trim()) faltando.push(t('jobForm.required.description'))
			if (!whatsapp) {
				if (!draft.jobResponsabilities.trim()) faltando.push(t('jobForm.required.responsibilities'))
				if (!draft.jobRequirements.trim()) faltando.push(t('jobForm.required.requirements'))
			}
			return faltando
		}
		if (step === 'questions') {
			return draft.jobQuestions.some((item) => item.question.trim())
				? []
				: [t('jobForm.required.questions')]
		}
		return []
	})()

	/*
	 * A cobrança só aparece DEPOIS de tentar avançar.
	 *
	 * Antes o formulário abria já com o campo em vermelho e "Falta preencher"
	 * embaixo, sem ninguém ter digitado nada — a tela recebia a pessoa
	 * apontando um erro que ela ainda não tinha como cometer. É a régua da v1
	 * (`validateStep` roda no clique de avançar, não na renderização).
	 */
	const [cobrou, setCobrou] = useState(false)
	useEffect(() => setCobrou(false), [step])

	const canAdvance = pendencias.length === 0
	/** Um campo por vez, para o Field marcar quem está impedindo. */
	const falta: FaltaFn = (rotulo) => cobrou && pendencias.includes(rotulo)

	async function submit() {
		setError(null)
		try {
			if (editing) {
				await patch.mutateAsync({
					jobId,
					data: {
						jobName: draft.jobName.trim(),
						...(draft.identifier.trim() ? { identifier: draft.identifier.trim() } : {}),
						carrerLevel: draft.carrerLevel,
						jobModel: draft.jobModel,
						contractType: draft.contractType,
						language: draft.language,
						jobDescription: draft.jobDescription,
						jobRequirements: draft.jobRequirements,
						jobResponsabilities: draft.jobResponsabilities,
						benefits: draft.benefits,
						salary: draft.salary,
						typeInterview: draft.typeInterview,
						interviewMode: draft.interviewMode,
						evaluateLanguage: draft.evaluateLanguage,
						public: draft.public,
						feedbackSlaHours: draft.feedbackSlaHours,
						jobCategories: draft.jobCategories,
						employmentType: draft.employmentType,
						jobHours: draft.jobHours,
						mainSkills: draft.mainSkills,
						screeningObjective: draft.screeningObjective,
						competencias_criticas: draft.competencias_criticas,
						competencias_adicionais: draft.competencias_adicionais,
						expectativas: draft.expectativas,
						priority: draft.priority,
						...(draft.orgUnitId ? { orgUnitId: draft.orgUnitId } : {}),
						...(Object.keys(draft.customFieldValues).length > 0
							? { customFieldValues: typedCustomFields(draft.customFieldValues, customFieldDefs) }
							: {}),
						limitedJobVacancy: draft.limitedJobVacancy,
						...(draft.limitNumberJobVacancies
							? { limitNumberJobVacancies: draft.limitNumberJobVacancies }
							: {}),
						...(draft.closingDate ? { closingDate: draft.closingDate } : {}),
						...(draft.educationalRequirement
							? { educationalRequiements: [draft.educationalRequirement] }
							: {}),
						address: {
							country: draft.country,
							state: draft.state,
							city: draft.city,
						},

						...(withQuestionIds(draft.jobQuestions).length > 0
							? { jobQuestions: withQuestionIds(draft.jobQuestions) as never }
							: {}),
					} as never,
				})
				clearDraft(draftKey)
				navigate({ to: '/vagas/$jobId/configuracao', params: { jobId } })
				return
			}

			const created = await create.mutateAsync({
				data: {
					...(fromRequisition.requisicao ? { requisitionId: fromRequisition.requisicao } : {}),
					jobName: draft.jobName.trim(),
					...(draft.identifier.trim() ? { identifier: draft.identifier.trim() } : {}),
					carrerLevel: draft.carrerLevel,
					jobModel: draft.jobModel,
					contractType: draft.contractType,
					language: draft.language,
					jobDescription: draft.jobDescription,
					jobRequirements: draft.jobRequirements,
					jobResponsabilities: draft.jobResponsabilities,
					benefits: draft.benefits,
					salary: draft.salary,
					typeInterview: draft.typeInterview,
					interviewMode: draft.interviewMode,
					evaluateLanguage: draft.evaluateLanguage,
					public: draft.public,
					jobCategories: draft.jobCategories,
					employmentType: draft.employmentType,
					jobHours: draft.jobHours,
					mainSkills: draft.mainSkills,
					screeningObjective: draft.screeningObjective,
					competencias_criticas: draft.competencias_criticas,
					competencias_adicionais: draft.competencias_adicionais,
					expectativas: draft.expectativas,
					priority: draft.priority,
					...(draft.orgUnitId ? { orgUnitId: draft.orgUnitId } : {}),
					...(Object.keys(draft.customFieldValues).length > 0
						? { customFieldValues: typedCustomFields(draft.customFieldValues, customFieldDefs) }
						: {}),
					limitedJobVacancy: draft.limitedJobVacancy,
					...(draft.limitNumberJobVacancies
						? { limitNumberJobVacancies: draft.limitNumberJobVacancies }
						: {}),
					...(draft.closingDate ? { closingDate: draft.closingDate } : {}),
					...(draft.educationalRequirement
						? { educationalRequiements: [draft.educationalRequirement] }
						: {}),
					address: {
						country: draft.country,
						state: draft.state,
						city: draft.city,
					},
					...(withQuestionIds(draft.jobQuestions).length > 0
						? { jobQuestions: withQuestionIds(draft.jobQuestions) as never }
						: {}),
				},
			})

			// a rota devolve `{ jobId }` — eu procurava `id`/`job.id`, então o
			// fluxo criava a vaga e caía na lista sem o SLA e sem levar pra
			// configuração
			const created_ = created.data as { jobId?: string; id?: string }
			const createdJobId = created_.jobId ?? created_.id

			// a régua vai num PATCH: `create-job` não aceita esses campos, e
			// falhar aqui não pode desfazer a vaga que já existe
			if (createdJobId && draft.feedbackSlaHours > 0) {
				await patch
					.mutateAsync({
						jobId: createdJobId,
						data: {
							feedbackSlaHours: draft.feedbackSlaHours,
							antiGhostingEnabled: true,
						} as never,
					})
					.catch(() => undefined)
			}

			clearDraft(draftKey)
			if (createdJobId)
				/*
				 * Vaga criada → DIVULGAÇÃO, não configuração.
				 *
				 * O Vitor apontou: terminando a criação a pessoa caía em Configuração,
				 * uma tela de ajuste fino, quando o que ela quer no minuto seguinte é
				 * divulgar o que acabou de criar. O link já está pronto ali, junto dos
				 * botões de rede.
				 */
				navigate({ to: '/vagas/$jobId/divulgacao', params: { jobId: createdJobId } })
			else navigate({ to: '/vagas' })
		} catch (err) {
			/*
			 * Mostra o detalhe do servidor quando existe.
			 *
			 * "Não foi possível criar a vaga" sozinho custou uma investigação
			 * inteira para descobrir que a causa era `jobQuestions/0/id Required`.
			 * Quem está criando a vaga não vai depurar rede — a mensagem precisa
			 * dizer o que revisar.
			 */
			const detail = (err as { data?: { details?: string; message?: string } })?.data
			setError(detail?.details ?? detail?.message ?? t('jobForm.error'))
		}
	}

	return (
		<Page
			title={t(editing ? 'jobForm.editTitle' : 'jobForm.title')}
			subtitle={
				<>
					<button
						onClick={() => navigate({ to: '/vagas' })}
						className='inline-flex items-center gap-1 text-muted transition-colors hover:text-text'
					>
						<ArrowLeft size={12} /> {t('jobForm.back')}
					</button>
					<span className='mx-1.5 text-muted'>/</span>
					{loadingJob
						? t('jobs.loading')
						: t(
								editing
									? 'jobForm.editSubtitle'
									: features.motor
										? 'jobForm.subtitle'
										: 'jobForm.subtitleOpen',
							)}
				</>
			}
		>

			{/* trilha do formulário: a mesma linguagem visual da régua de etapas */}
			<ol className='mb-4 flex items-center gap-1'>
				{steps.map((name, index) => (
					<li key={name} className='flex flex-1 flex-col gap-1.5'>
						<span
							className={cn(
								'h-[3px] rounded-[1px]',
								index < stepIndex ? 'bg-data-done' : index === stepIndex ? 'bg-lime' : 'bg-data-track',
							)}
						/>
						<span
							className={cn(
								'text-[11px]',
								index === stepIndex ? 'font-medium text-text' : 'text-muted',
							)}
						>
							{t(`jobForm.step.${name}`)}
						</span>
					</li>
				))}
			</ol>

			{/*
			 * O aviso existe porque recuperar em silêncio confunde: a pessoa abre
			 * "Nova vaga" e encontra campos preenchidos sem saber de onde vieram.
			 * Dizer quando foi salvo e oferecer o descarte resolve as duas coisas.
			 */}
			{restored && (
				<div className='mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border border-l-[3px] border-l-lime bg-card px-4 py-2.5 text-[12.5px]'>
					<span className='min-w-0 flex-1'>
						{t('jobForm.draftRestored', {
							when: recovered ? since(recovered.savedAt, i18n.language) : '',
						})}
					</span>
					<button
						onClick={() => {
							clearDraft(draftKey)
							setDraft(EMPTY)
							setStep('basics')
							setRestored(false)
						}}
						className='shrink-0 text-[12px] text-text-2 underline-offset-2 transition-colors hover:text-danger hover:underline'
					>
						{t('jobForm.draftDiscard')}
					</button>
					<button
						onClick={() => setRestored(false)}
						className='shrink-0 text-[12px] text-lime-fg'
					>
						{t('jobForm.draftKeep')}
					</button>
				</div>
			)}

			<Card>
				{step === 'basics' && <BasicsStep draft={draft} set={set} falta={falta} />}
				{step === 'description' && <DescriptionStep draft={draft} set={set} falta={falta} />}
				{step === 'competencies' && (
					<CompetenciesStep
						draft={draft}
						onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
					/>
				)}
				{step === 'interview' && <InterviewStep draft={draft} set={set} />}
				{step === 'questions' && (
					<QuestionsStep
						draft={draft}
						onChange={(questions) => set('jobQuestions', questions)}
					/>
				)}
				{step === 'review' && <ReviewStep draft={draft} />}
			</Card>

			{error && (
				<p className='mt-3 rounded-lg border border-border bg-danger-soft px-3 py-2 text-[12px] text-danger'>
					{error}
				</p>
			)}

			<div className='mt-4 flex items-center justify-between'>
				<Button
					variant='secondary'
					disabled={stepIndex === 0}
					onClick={() => setStep(steps[stepIndex - 1])}
				>
					<ArrowLeft size={13} /> {t('jobForm.previous')}
				</Button>

				{step === 'review' ? (
					<Button onClick={() => setConfirming(true)} disabled={create.isPending || patch.isPending}>
						{create.isPending || patch.isPending ? (
							<Loader2 size={13} className='animate-spin' />
						) : (
							<Check size={13} />
						)}
						{editing
							? patch.isPending
								? t('jobConfig.saving')
								: t('jobForm.saveChanges')
							: create.isPending
								? t('jobForm.creating')
								: t('jobForm.create')}
					</Button>
				) : (
					<>
						{/*
						 * O motivo fica VISÍVEL. Botão travado sem explicação faz a pessoa
						 * achar que a tela quebrou.
						 */}
						{cobrou && pendencias.length > 0 && (
							<span className='inline-flex items-center gap-1.5 text-[12px] font-medium text-danger'>
								<AlertTriangle size={13} />
								{t('jobForm.required.missing', { fields: pendencias.join(', ') })}
							</span>
						)}
						{/*
						 * Habilitado mesmo faltando campo: o clique é o que MOSTRA o que
						 * falta. Travado desde a abertura, a pessoa não descobre o motivo
						 * — e travado depois do aviso, ela não tem como pedir de novo.
						 */}
						<Button
							onClick={() => {
								if (!canAdvance) {
									setCobrou(true)
									return
								}
								setStep(steps[stepIndex + 1])
							}}
						>
							{t('jobForm.next')} <ArrowRight size={13} />
						</Button>
					</>
				)}
			</div>
			{/*
			 * Confirmação com CONSEQUÊNCIA escrita, não "tem certeza?".
			 *
			 * O que importa é se a vaga vai ao ar pública e quantas perguntas o
			 * candidato vai responder — as duas coisas que doem depois de
			 * publicado. Repetir a pergunta sem dizer o que acontece só treina a
			 * pessoa a clicar em "sim".
			 */}
			{confirming && (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
					onClick={() => setConfirming(false)}
				>
					<div
						role='dialog'
						aria-modal='true'
						className='w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg'
						onClick={(event) => event.stopPropagation()}
					>
						<h2 className='text-[15px] font-medium'>
							{t(editing ? 'jobForm.confirmSaveTitle' : 'jobForm.confirmTitle')}
						</h2>
						<p className='mt-1 text-[12.5px] text-text-2'>
							{t(editing ? 'jobForm.confirmSaveHint' : 'jobForm.confirmHint')}
						</p>

						<dl className='mt-3 flex flex-col gap-1.5 border-t border-border-soft pt-3 text-[12.5px]'>
							<div className='flex gap-2'>
								<dt className='w-28 shrink-0 text-muted'>{t('jobForm.jobName')}</dt>
								<dd className='min-w-0 flex-1 truncate font-medium'>{draft.jobName}</dd>
							</div>
							<div className='flex gap-2'>
								<dt className='w-28 shrink-0 text-muted'>{t('jobForm.visibility')}</dt>
								<dd className='min-w-0 flex-1'>
									{t(draft.public ? 'jobForm.visiblePublic' : 'jobForm.visiblePrivate')}
								</dd>
							</div>
							{features.motor && (
								<div className='flex gap-2'>
									<dt className='w-28 shrink-0 text-muted'>{t('jobForm.step.questions')}</dt>
									<dd className='font-num min-w-0 flex-1'>
										{t('jobForm.questionCount', { count: draft.jobQuestions.length })}
									</dd>
								</div>
							)}
						</dl>

						<div className='mt-5 flex justify-end gap-2'>
							<Button variant='secondary' onClick={() => setConfirming(false)}>
								{t('filters.cancel')}
							</Button>
							<Button
								onClick={() => {
									setConfirming(false)
									void submit()
								}}
								disabled={create.isPending || patch.isPending}
							>
								{t(editing ? 'jobForm.save' : 'jobForm.publish')}
							</Button>
						</div>
					</div>
				</div>
			)}
		</Page>
	)
}

type FaltaFn = (rotulo: string) => boolean
type SetFn = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => void

function BasicsStep({ draft, set, falta }: { draft: JobDraft; set: SetFn; falta: FaltaFn }) {
	const setCustomField = (key: string, value: string) =>
		set('customFieldValues', { ...draft.customFieldValues, [key]: value })

	/*
	 * Estrutura da empresa. O campo só aparece se a empresa o definiu —
	 * formulário com seção vazia de "campos personalizados" é ruído para os 90%
	 * que nunca vão criar nenhum.
	 */
	const { data: unitsData } = empresa.useGetCompaniesOrgUnits()
	const orgUnits =
		(unitsData?.data as
			| {
					units?: Array<{
						id: string
						name: string
						externalCode?: string | null
						parentId?: string | null
					}>
			  }
			| undefined
		)?.units ?? []
	const { data: fieldsData } = empresa.useGetCompaniesCustomFields({ entity: 'job' })
	const jobCustomFields =
		(fieldsData?.data as
			| {
					fields?: Array<{
						id: string
						key: string
						label: string
						type: string
						options?: string[] | null
					}>
			  }
			| undefined
		)?.fields ?? []

	const { t, i18n } = useTranslation()
	return (
		<div className='flex flex-col gap-4'>
			<Hint>{t('jobForm.hints.basics')}</Hint>

			<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
				<Field
					className='md:col-span-2'
					label={t('jobForm.jobName')}
					hint={t('jobForm.jobNameHint')}
					faltando={falta(t('jobForm.required.jobName'))}
				>
					<input
						value={draft.jobName}
						onChange={(e) => set('jobName', e.target.value)}
						placeholder={t('jobForm.jobNamePlaceholder')}
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
					/>
				</Field>
				<Field label={t('jobForm.identifier')} hint={t('jobForm.identifierHint')}>
					<input
						value={draft.identifier}
						onChange={(e) => set('identifier', e.target.value)}
						placeholder='VG-2481'
						className='font-num h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
					/>
				</Field>

				<Field label={t('jobForm.level')} faltando={falta(t('jobForm.required.level'))}>
					{/* 22 níveis: nativo obrigaria rolar a lista procurando */}
					<SearchableSelect
						value={draft.carrerLevel}
						onChange={(v) => set('carrerLevel', v)}
						placeholder={t('jobForm.levelPlaceholder')}
						options={opcoes(LEVELS, i18n.language)}
					/>
				</Field>
				{/*
				 * Unidade e campos próprios ficam no passo Básico porque são
				 * classificação, não conteúdo da vaga — e porque quem preenche isso
				 * (o RH) preenche junto com nível e contrato, não depois de escrever
				 * a descrição.
				 */}
				{orgUnits.length > 0 && (
					<Field label={t('jobForm.orgUnit')} hint={t('jobForm.orgUnitHint')}>
						<Select
							value={draft.orgUnitId}
							onChange={(v) => set('orgUnitId', v)}
							options={[
								{ value: '', label: t('jobForm.orgUnitNone') },
								// caminho completo ("Tecnologia › Engenharia"): escolher a folha
								// certa exige ver a árvore, não só o nome repetido
								...orgUnitTree(orgUnits).map(({ unit }) => ({
									value: unit.id,
									label: `${orgUnitPath(unit, orgUnits)}${unit.externalCode ? ` · ${unit.externalCode}` : ''}`,
								})),
							]}
						/>
					</Field>
				)}

				{jobCustomFields.map((field) => (
					<Field key={field.id} label={field.label}>
						{/*
						 * Cada tipo tem o controle dele. `boolean` caindo em campo de
						 * texto — como estava — deixa a pessoa digitar "sim", "S", "1"
						 * ou "talvez", e o dado nasce impossível de filtrar.
						 */}
						{field.type === 'select' || field.type === 'boolean' ? (
							<Select
								value={draft.customFieldValues[field.key] ?? ''}
								onChange={(v) => setCustomField(field.key, v)}
								options={
									field.type === 'boolean'
										? [
												{ value: '', label: t('jobForm.orgUnitNone') },
												{ value: 'true', label: t('jobForm.yes') },
												{ value: 'false', label: t('jobForm.no') },
											]
										: [
												{ value: '', label: t('jobForm.orgUnitNone') },
												...(field.options ?? []).map((option) => ({
													value: option,
													label: option,
												})),
											]
								}
							/>
						) : (
							<input
								type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
								value={draft.customFieldValues[field.key] ?? ''}
								onChange={(event) => setCustomField(field.key, event.target.value)}
								className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[12.5px]'
							/>
						)}
					</Field>
				))}

				<Field label={t('jobForm.category')} faltando={falta(t('jobForm.required.category'))}>
					{/* categorias são dezenas: nativo obrigaria rolar procurando */}
					<SearchableSelect
						value={draft.jobCategories}
						onChange={(v) => set('jobCategories', v)}
						placeholder={t('jobForm.categoryPlaceholder')}
						options={CATEGORIES.map((value) => ({ value, label: value }))}
					/>
				</Field>
				<Field label={t('jobForm.model')}>
					<Select
						value={draft.jobModel}
						onChange={(v) => set('jobModel', v)}
						options={opcoes(MODELS, i18n.language)}
					/>
				</Field>

				<Field label={t('jobForm.contract')}>
					<Select
						value={draft.contractType}
						onChange={(v) => set('contractType', v)}
						options={opcoes(CONTRACTS, i18n.language)}
					/>
				</Field>
				<Field label={t('jobForm.jobHours')} hint={t('jobForm.jobHoursHint')}>
					<input
						value={draft.jobHours}
						onChange={(e) => set('jobHours', e.target.value)}
						placeholder='44h semanais'
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
					/>
				</Field>
				<Field label={t('jobForm.education')}>
					<SearchableSelect
						value={draft.educationalRequirement}
						onChange={(v) => set('educationalRequirement', v)}
						placeholder={t('jobForm.educationPlaceholder')}
						options={opcoes(EDUCATION, i18n.language)}
					/>
				</Field>

				<Field label={t('jobForm.country')}>
					<input
						value={draft.country}
						onChange={(e) => set('country', e.target.value)}
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
					/>
				</Field>
				<Field label={t('jobForm.state')}>
					<input
						value={draft.state}
						onChange={(e) => set('state', e.target.value)}
						placeholder='SP'
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
					/>
				</Field>
				<Field label={t('jobForm.city')}>
					<input
						value={draft.city}
						onChange={(e) => set('city', e.target.value)}
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
					/>
				</Field>

				<Field label={t('jobForm.closingDate')} hint={t('jobForm.closingDateHint')}>
					<input
						type='date'
						value={draft.closingDate}
						onChange={(e) => set('closingDate', e.target.value)}
						className='h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
					/>
				</Field>
				<Field label={t('jobForm.mainSkills')} hint={t('jobForm.mainSkillsHint')}>
					<SkillsInput value={draft.mainSkills} onChange={(next) => set('mainSkills', next)} />
				</Field>
				<Field label={t('jobForm.vacancies')} hint={t('jobForm.vacanciesHint')}>
					<input
						type='number'
						min={0}
						value={draft.limitNumberJobVacancies}
						onChange={(e) => {
							set('limitNumberJobVacancies', e.target.value)
							set('limitedJobVacancy', Number(e.target.value) > 0)
						}}
						className='font-num h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
					/>
				</Field>
			</div>

			<label className='flex w-fit cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2'>
				<input
					type='checkbox'
					checked={draft.priority}
					onChange={(e) => set('priority', e.target.checked)}
					className='h-3.5 w-3.5 accent-[var(--lime)]'
				/>
				<span className='text-[12.5px]'>
					{t('jobForm.priority')}
					<span className='ml-1.5 text-[11.5px] text-muted'>{t('jobForm.priorityHint')}</span>
				</span>
			</label>
		</div>
	)
}

function DescriptionStep({ draft, set, falta }: { draft: JobDraft; set: SetFn; falta: FaltaFn }) {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const generate = empresa.usePostIaJobDescription()
	const [failed, setFailed] = useState(false)

	async function generateDescription() {
		setFailed(false)
		try {
			// o contrato é `{cargo, nivel, idioma}` — mandar jobName/carrerLevel
			// dava 400 e a geração nunca funcionou
			const response = await generate.mutateAsync({
				data: {
					cargo: draft.jobName.trim(),
					nivel: draft.carrerLevel,
					idioma: draft.language,
				},
			})
			const body = response.data as {
				descricao?: string
				responsabilidades?: string
				requisitos?: string
			}
			if (!body.descricao && !body.responsabilidades && !body.requisitos) {
				setFailed(true)
				return
			}
			// a IA devolve os TRÊS blocos; preencher só a descrição jogava fora
			// metade do que o motor gerou
			if (body.descricao) set('jobDescription', body.descricao)
			if (body.responsabilidades) set('jobResponsabilities', body.responsabilidades)
			if (body.requisitos) set('jobRequirements', body.requisitos)
		} catch {
			setFailed(true)
		}
	}

	return (
		<div className='flex flex-col gap-3'>
			<Hint>{t(features.motor ? 'jobForm.hints.description' : 'jobForm.hints.descriptionManual')}</Hint>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='text-[12px] text-text-2'>
					{t(features.motor ? 'jobForm.descriptionHelp' : 'jobForm.descriptionHelpManual')}
				</p>
				{/* geração usa o ai-engine — sem o Motor o botão falharia sempre */}
				{features.motor && (
					<Button
						variant='secondary'
						size='sm'
						disabled={!draft.jobName.trim() || generate.isPending}
						onClick={() => void generateDescription()}
					>
						{generate.isPending ? (
							<Loader2 size={12} className='animate-spin' />
						) : (
							<Sparkles size={12} />
						)}
						{generate.isPending ? t('jobForm.generating') : t('jobForm.generate')}
					</Button>
				)}
			</div>

			{failed && <p className='text-[12px] text-danger'>{t('jobForm.generateError')}</p>}

			{/*
			 * Editor Markdown, não textarea cru: estes textos SÃO a página pública
			 * da vaga. "Usar modelo" só aparece com o campo vazio — preenche o
			 * esqueleto de seções (padrão de portal) sem risco de sobrescrever.
			 */}
			<MarkdownField
				label={t('jobForm.description')}
				faltando={falta(t('jobForm.required.description'))}
				value={draft.jobDescription}
				onChange={(v) => set('jobDescription', v)}
				template={t('jobForm.templates.description')}
				rows={8}
			/>
			<MarkdownField
				label={t('jobForm.requirements')}
				faltando={falta(t('jobForm.required.requirements'))}
				value={draft.jobRequirements}
				onChange={(v) => set('jobRequirements', v)}
				template={t('jobForm.templates.requirements')}
				rows={6}
			/>
			<MarkdownField
				label={t('jobForm.responsibilities')}
				faltando={falta(t('jobForm.required.responsibilities'))}
				value={draft.jobResponsabilities}
				onChange={(v) => set('jobResponsabilities', v)}
				template={t('jobForm.templates.responsibilities')}
				rows={6}
			/>
			<MarkdownField
				label={t('jobForm.benefits')}
				hint={t('jobForm.benefitsHint')}
				value={draft.benefits}
				onChange={(v) => set('benefits', v)}
				template={t('jobForm.templates.benefits')}
				rows={5}
			/>
			<Field label={t('jobForm.salary')} hint={t('jobForm.salaryHint')}>
				<input
					type='text'
					value={draft.salary}
					onChange={(e) => set('salary', e.target.value)}
					placeholder={t('jobForm.salaryPlaceholder')}
					className='h-9 w-full max-w-sm rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text'
				/>
			</Field>
		</div>
	)
}

/** Campo Markdown com o link "usar modelo" (só quando vazio) no rótulo. */
function MarkdownField({
	label,
	hint,
	faltando,
	value,
	onChange,
	template,
	rows,
}: {
	label: string
	hint?: string
	faltando?: boolean
	value: string
	onChange: (v: string) => void
	template: string
	rows: number
}) {
	const { t } = useTranslation()
	return (
		<div className='flex flex-col gap-1'>
			<div className='flex items-baseline justify-between gap-2'>
				<span className={`text-[12px] font-medium ${faltando ? 'text-danger' : 'text-text-2'}`}>
					{label}
					{hint && <span className='ml-1.5 font-normal text-muted'>{hint}</span>}
					{faltando && <span className='ml-1.5 font-normal'>· obrigatório</span>}
				</span>
				{!value.trim() && template.trim() !== '' && (
					<button
						type='button'
						onClick={() => onChange(template)}
						className='flex items-center gap-1 text-[11.5px] font-medium text-text-2 transition-colors hover:text-text'
					>
						<LayoutTemplate size={11} />
						{t('jobForm.useTemplate')}
					</button>
				)}
			</div>
			<MarkdownEditor value={value} onChange={onChange} rows={rows} />
		</div>
	)
}

function InterviewStep({ draft, set }: { draft: JobDraft; set: SetFn }) {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	return (
		<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
			<div className='md:col-span-2 xl:col-span-3'>
				{/*
				 * Sem o Motor estas escolhas não rodam hoje — mas ficam gravadas na
				 * vaga e valem no dia em que o plugin entrar. Dizer isso é o que
				 * separa "configurar o futuro" de "formulário que finge".
				 */}
				<Hint>
					{t(features.motor ? 'jobForm.hints.interview' : 'jobForm.hints.interviewOpen')}
				</Hint>
			</div>
			<Field label={t('jobForm.interviewType')} hint={t('jobForm.interviewTypeHint')}>
				<Select
					value={draft.typeInterview}
					onChange={(v) => set('typeInterview', v as JobDraft['typeInterview'])}
					options={['interview', 'evaluation', 'emotional', 'whatsapp'].map((value) => ({
						value,
						label: t(`interviewTypes.${value}`),
					}))}
				/>
			</Field>
			<Field label={t('jobForm.interviewMode')}>
				<Select
					value={draft.interviewMode}
					onChange={(v) => set('interviewMode', v as JobDraft['interviewMode'])}
					options={['video', 'voice', 'whatsapp'].map((value) => ({
						value,
						label: t(`jobForm.modes.${value}`),
					}))}
				/>
			</Field>
			<Field label={t('jobForm.language')}>
				<Select
					value={draft.language}
					onChange={(v) => set('language', v)}
					options={[
						{ value: 'pt-BR', label: 'Português (BR)' },
						{ value: 'en', label: 'English' },
						{ value: 'es', label: 'Español' },
					]}
				/>
			</Field>
			<Field label={t('jobForm.sla')} hint={t('jobForm.slaHint')}>
				<Select
					value={String(draft.feedbackSlaHours)}
					onChange={(v) => set('feedbackSlaHours', Number(v))}
					options={[24, 48, 72, 168].map((hours) => ({
						value: String(hours),
						label: t('jobConfig.slaPreset', { hours }),
					}))}
				/>
			</Field>

			<Field
				className='md:col-span-2 xl:col-span-3'
				label={t('jobForm.screeningObjective')}
				hint={t('jobForm.screeningObjectiveHint')}
			>
				<TextArea
					rows={2}
					value={draft.screeningObjective}
					onChange={(v) => set('screeningObjective', v)}
					placeholder={t('jobForm.screeningObjectivePlaceholder')}
				/>
			</Field>

			<label className='flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 md:col-span-2 xl:col-span-3'>
				<input
					type='checkbox'
					checked={draft.evaluateLanguage}
					onChange={(e) => set('evaluateLanguage', e.target.checked)}
					className='mt-0.5 h-3.5 w-3.5 accent-[var(--lime)]'
				/>
				<span>
					<span className='block text-[12.5px] font-medium'>{t('jobForm.evaluateLanguage')}</span>
					<span className='block text-[11.5px] text-text-2'>
						{t('jobForm.evaluateLanguageHint')}
					</span>
				</span>
			</label>
		</div>
	)
}

function ReviewStep({ draft }: { draft: JobDraft }) {
	const { t } = useTranslation()
	const { features } = useCapabilities()
	const rows: Array<[string, string]> = [
		[t('jobForm.jobName'), draft.jobName || '—'],
		[t('jobForm.identifier'), draft.identifier || '—'],
		[t('jobForm.level'), draft.carrerLevel || '—'],
		// sem Motor não existe entrevista — resumir "Vídeo" aqui era ficção
		...(features.motor
			? ([[t('jobForm.interviewType'), t(`interviewTypes.${draft.typeInterview}`)]] as Array<
					[string, string]
				>)
			: []),
		[t('jobForm.sla'), t('jobConfig.slaPreset', { hours: draft.feedbackSlaHours })],
		// idem: contagem de perguntas de entrevista só existe com o Motor
		...(features.motor
			? ([[t('jobForm.questionsCount'), String(draft.jobQuestions.length)]] as Array<
					[string, string]
				>)
			: []),
	]

	return (
		<div className='flex flex-col gap-3'>
			<p className='text-[12px] text-text-2'>{t('jobForm.reviewHelp')}</p>
			<dl className='divide-y divide-border-soft'>
				{rows.map(([label, value]) => (
					<div key={label} className='flex items-baseline justify-between gap-4 py-2'>
						<dt className='text-[12px] text-muted'>{label}</dt>
						<dd className='truncate text-[12.5px] font-medium'>{value}</dd>
					</div>
				))}
			</dl>
			<p className='rounded-lg border border-lime-mid bg-lime-soft px-3 py-2 text-[12px] text-text'>
				{t('jobForm.reviewNotice')}
			</p>
		</div>
	)
}
