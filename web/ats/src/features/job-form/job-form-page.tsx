import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, Check, CircleHelp, FileText, LayoutTemplate, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { empresa } from '@coploy/sdk/react'

import { useCapabilities } from '@/lib/capabilities'
import { orgUnitPath, orgUnitTree } from '@/lib/org-tree'
import { clearDraft, readDraft, since, writeDraft } from '@/lib/draft-storage'
import { useEyebrow } from '@/app/eyebrow'
import { cn } from '@/lib/cn'
import { stagger } from '@/lib/motion'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, Page } from '@/ui/page'
import { Markdown } from '@/ui/markdown'
import { MarkdownEditor } from '@/ui/markdown-editor'

import { Field, Select, TextArea } from './fields'
import { AGENT_TOOL_NAMES } from './agent-tools'
import { useAgentTools } from './use-agent-tools'
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
function Hint({ children, quiet = false }: { children: React.ReactNode; quiet?: boolean }) {
	/*
	 * `quiet`: quando um agente está registrado, a explicação de cada passo
	 * vive no CONTRATO (get_writing_guide) e a tela é para assistir — a caixa
	 * de dica vira uma linha discreta em vez de um cartão que compete com o
	 * campo (insight do WebMCP: menos texto de explicação na tela).
	 */
	if (quiet) return <p className='text-[12px] leading-snug text-muted'>{children}</p>
	return (
		<p className='rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] leading-snug text-text-2'>
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
	/** Retorno automático ao candidato. Ver o campo no formulário. */
	sendCandidateFeedback: boolean
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

/**
 * Aplica um modelo sobre o rascunho em curso.
 *
 * ⚠️ O modelo PREENCHE lacuna, não sobrescreve.
 *
 * Quem escolheu o modelo pela lista chega com o formulário vazio e recebe tudo;
 * quem já digitou o cargo mantém o que digitou. Sobrescrever seria apagar
 * trabalho da pessoa em nome de uma sugestão — o erro é irreversível para ela e
 * o ganho é nenhum.
 */
type SugestaoDeModelo = {
	id: string
	name: string
	jobName?: string | null
	lastUsedAt?: string | Date | null
	createdAt?: string | Date | null
}

/** Último uso; sem uso, cai na criação — modelo novo não fica no fim para sempre. */
function quando(m: SugestaoDeModelo): number {
	const data = m.lastUsedAt ?? m.createdAt
	return data ? new Date(data).getTime() : 0
}

function aplicarModelo(atual: JobDraft, modelo: Record<string, unknown>): JobDraft {
	const resultado = { ...atual } as unknown as Record<string, unknown>
	const vazio = (v: unknown) =>
		v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

	for (const [chave, valor] of Object.entries(modelo)) {
		if (chave in EMPTY === false) continue
		if (vazio(valor)) continue
		/* nível e idioma nascem com default: "igual ao default" conta como vazio */
		const atualValor = resultado[chave]
		const ehDefault = atualValor === (EMPTY as unknown as Record<string, unknown>)[chave]
		if (vazio(atualValor) || ehDefault) resultado[chave] = valor
	}

	/* o cargo sugerido só entra se a pessoa ainda não escreveu um */
	if (!atual.jobName.trim() && typeof modelo.jobName === 'string') {
		resultado.jobName = modelo.jobName
	}
	return resultado as unknown as JobDraft
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
	// ausente na base = envia; o rascunho novo nasce igual ao padrão
	sendCandidateFeedback: true,
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
 *
 * `questions` ficou (plano D, decisão D1): sem o Motor ela é o ROTEIRO da
 * entrevista humana — a vaga guarda as perguntas em `jobQuestions` do mesmo
 * jeito, e já nasce entrevistável se o plugin vier depois. Opcional aqui:
 * quem só quer abrir a vaga não é travado por ela (`pendencias`).
 */
const OPEN_STEPS = ['basics', 'description', 'competencies', 'questions', 'review'] as const
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
	const eyebrow = useEyebrow()
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
	const fromRequisition = useSearch({ strict: false }) as {
		requisicao?: string
		titulo?: string
		modelo?: string
		entrevista?: 'sim' | 'nao'
	}

	/*
	 * Chave por modo: o rascunho de uma vaga nova não pode reaparecer dentro da
	 * edição de outra, e cada vaga em edição tem o seu.
	 */
	const draftKey = editing ? `job:${jobId}` : 'job:new'
	const recovered = useMemo(() => readDraft<JobDraft>(draftKey), [draftKey])

	const { features } = useCapabilities()

	/*
	 * A vaga conduz entrevista com o Motor?
	 *
	 * Sem o plugin, nunca — não há entrevista para configurar. Com ele, quem
	 * decide é a porta escolhida na lista de vagas; ausente (link direto,
	 * favorito, edição) mantém o comportamento de sempre.
	 */
	const comEntrevista = features.motor && fromRequisition.entrevista !== 'nao'

	/*
	 * Os passos de entrevista e perguntas só existem para a vaga que entrevista.
	 * Mostrá-los na outra porta seria pedir configuração de algo que a vaga
	 * declarou não ter.
	 */
	const steps: readonly Step[] = comEntrevista ? STEPS : OPEN_STEPS

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
	/*
	 * Modelo escolhido em /modelos.
	 *
	 * Só busca se NÃO há rascunho recuperado: quem já começou a escrever não
	 * pode ter o próprio texto sobrescrito por um modelo pedido dez minutos
	 * antes.
	 */
	const { data: modeloData } = empresa.useGetCompaniesJobTemplatesId(
		fromRequisition.modelo ?? '',
		{ query: { enabled: Boolean(fromRequisition.modelo) && !recovered } },
	)
	const [modeloAplicado, setModeloAplicado] = useState(false)
	/** Qual modelo alimentou este rascunho — vai no POST para marcar o uso. */
	const [modeloUsado, setModeloUsado] = useState<string | null>(
		fromRequisition.modelo ?? null,
	)
	useEffect(() => {
		if (modeloAplicado || !modeloData?.data) return
		const modelo = (modeloData.data as { template?: Record<string, unknown> }).template
		if (!modelo) return
		setDraft((atual) => aplicarModelo(atual, modelo))
		setModeloAplicado(true)
	}, [modeloData, modeloAplicado])

	/*
	 * O modelo do cargo aparece sozinho.
	 *
	 * A lista inteira é pequena (é por empresa) e já vem para o menu, então não há
	 * chamada nova: o casamento é pelo cargo que a pessoa acabou de escrever. Não
	 * aplica sozinho de propósito — "começar do zero" tem que ser o que acontece
	 * quando ninguém clica em nada, e conteúdo que aparece sem pedir no meio da
	 * digitação faz a pessoa desconfiar do que ela mesma escreveu.
	 */
	const { data: modelosData } = empresa.useGetCompaniesJobTemplates()
	const sugestao = useMemo(() => {
		const cargo = draft.jobName.trim().toLowerCase()
		if (cargo.length < 3 || modeloAplicado) return null
		const lista = ((modelosData?.data as { templates?: SugestaoDeModelo[] })?.templates ??
			[]) as SugestaoDeModelo[]
		const doCargo = lista.filter((m) => (m.jobName ?? '').trim().toLowerCase() === cargo)
		if (doCargo.length === 0) return null
		/* o último USADO ganha do último criado: é o que a equipe adotou de fato */
		return doCargo.sort((a, b) => quando(b) - quando(a))[0]
	}, [draft.jobName, modelosData, modeloAplicado])

	const { data: sugerido } = empresa.useGetCompaniesJobTemplatesId(sugestao?.id ?? '', {
		query: { enabled: Boolean(sugestao) },
	})

	function aplicarSugestao() {
		const modelo = (sugerido?.data as { template?: Record<string, unknown> } | undefined)
			?.template
		if (!modelo || !sugestao) return
		setDraft((atual) => aplicarModelo(atual, modelo))
		setModeloAplicado(true)
		setModeloUsado(sugestao.id)
	}

	/** Aviso do rascunho recuperado — dispensável, some ao descartar ou ao salvar. */
	const [restored, setRestored] = useState(Boolean(recovered))
	const [promptCopied, setPromptCopied] = useState(false)
	const [agentHelp, setAgentHelp] = useState(false)
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
			/*
			 * `!== false` e não `=== true`: a vaga que nunca teve a chave tocada
			 * chega `null`, e comparar com `true` a abriria como DESLIGADA — o PUT
			 * manda o rascunho inteiro e gravaria o retorno desligado sem ninguém
			 * ter pedido. Mesmo defeito que a avaliação de idioma já teve.
			 */
			sendCandidateFeedback: (job as { sendCandidateFeedback?: boolean | null })
				.sendCandidateFeedback !== false,
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

	/*
	 * "Preencher com o seu agente" (plano D, decisão D3: só sem o Motor).
	 *
	 * Registra as ferramentas WebMCP no navegador enquanto o formulário está
	 * montado. Sem suporte ou sem a chave de build, `registered` fica falso e
	 * nada aparece — melhoria progressiva.
	 */
	const areasDoFormulario = useAreasDeVaga()
	const agent = useAgentTools({
		enabled: !features.motor,
		draft,
		setDraft,
		step,
		setStep: (next) => setStep(next as Step),
		steps,
		areas: areasDoFormulario,
	})

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
			// sem o Motor a etapa é roteiro para a entrevista humana: opcional
			if (!comEntrevista) return []
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
	/*
	 * Rascunho não passa pelas pendências do passo: é justamente o lugar de
	 * guardar trabalho pela metade. A única exigência é ter um cargo, senão a
	 * pessoa não reconhece o próprio rascunho na lista depois.
	 */
	const [salvandoRascunho, setSalvandoRascunho] = useState(false)
	useEffect(() => setCobrou(false), [step])

	const canAdvance = pendencias.length === 0
	/** Um campo por vez, para o Field marcar quem está impedindo. */
	const falta: FaltaFn = (rotulo) => cobrou && pendencias.includes(rotulo)

	/**
	 * @param comoRascunho vem por ARGUMENTO, não pelo estado.
	 *
	 * `setSalvandoRascunho(true)` seguido de `submit()` no mesmo handler faz o
	 * submit ler o valor ANTIGO do closure — o rascunho era enviado como `open`
	 * e o servidor recusava, corretamente, uma vaga sem descrição.
	 */
	async function submit(comoRascunho = false) {
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
						sendCandidateFeedback: draft.sendCandidateFeedback,
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
					/*
					 * Declarar o estado é o que liga a guarda de publicação no servidor.
					 * Sem isso o servidor trata como criação legada e não cobra nada —
					 * o opt-in é o que mantém as integrações funcionando.
					 */
					status: comoRascunho ? 'draft' : 'open',
					/*
					 * Declarado só quando o Motor existe: numa instalação sem ele o
					 * servidor já sabe a resposta, e gravar `false` escreveria uma
					 * decisão que ninguém tomou.
					 */
					...(features.motor ? { aiInterview: comEntrevista } : {}),
					...(fromRequisition.requisicao ? { requisitionId: fromRequisition.requisicao } : {}),
					...(modeloUsado ? { templateId: modeloUsado } : {}),
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
					sendCandidateFeedback: draft.sendCandidateFeedback,
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
			/*
			 * Rascunho volta para a lista, não para Divulgação: não há o que
			 * divulgar, e é na lista que ele precisa ser reencontrado depois.
			 */
			if (comoRascunho) {
				navigate({ to: '/vagas' })
				return
			}
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
			/* Falhou: a próxima tentativa não pode herdar a intenção anterior. */
			setSalvandoRascunho(false)
			/*
			 * Mostra o detalhe do servidor quando existe.
			 *
			 * "Não foi possível criar a vaga" sozinho custou uma investigação
			 * inteira para descobrir que a causa era `jobQuestions/0/id Required`.
			 * Quem está criando a vaga não vai depurar rede — a mensagem precisa
			 * dizer o que revisar.
			 */
			type Detail = { details?: string; message?: string }
			const raw = (err as { data?: Detail | string })?.data
			// o corpo às vezes chega como texto JSON — mostrar `{"message":…}` na tela não é mensagem
			let detail: Detail | undefined
			if (typeof raw === 'string') {
				try {
					detail = JSON.parse(raw) as Detail
				} catch {
					detail = { message: raw }
				}
			} else {
				detail = raw
			}
			const msg = detail?.details ?? detail?.message ?? t('jobForm.error')
			// a regra "exige requisição" é uma CHAVE da empresa — dizer onde ela mora
			setError(/requisi[çc][ãa]o aprovada|approved requisition/i.test(msg) ? t('jobForm.requisitionRequired') : msg)
		}
	}

	return (
		<Page
			title={t(editing ? 'jobForm.editTitle' : 'jobForm.title')}
			// contexto de produto, não jargão nosso: "Recrutamento · Vagas · Nova vaga"
			eyebrow={`${eyebrow} · ${t(editing ? 'jobForm.editTitle' : 'jobForm.title')}`}
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
									: comEntrevista
										? 'jobForm.subtitle'
										: 'jobForm.subtitleOpen',
							)}
				</>
			}
		>

			{/*
			 * Três colunas, como no protótipo "Vaga com o seu agente": os passos à
			 * esquerda, o formulário no meio, o agente à direita. Quando um agente
			 * preenche a vaga, a pessoa não lê campo a campo — ASSISTE. A tela tem
			 * que contar sozinha em que passo está, o que já foi feito e quem está
			 * fazendo; por isso os passos e o agente são colunas, não avisos.
			 */}
			<div
				className={cn(
					'grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)]',
					!features.motor && 'xl:grid-cols-[200px_minmax(0,1fr)_290px]',
				)}
			>
			<aside className='rise lg:sticky lg:top-0'>
				<ol className='flex flex-col'>
					{steps.map((name, index) => {
						const done = index < stepIndex
						const current = index === stepIndex
						const agentHere = agent.filling === name
						return (
							<li key={name} style={stagger(index, 60, 360)} className='rise'>
								<button
									type='button'
									onClick={() => (done || current) && setStep(name)}
									className={cn(
										'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13.5px] transition-colors duration-300',
										current || done ? 'text-text' : 'text-text-2',
										current && 'font-semibold',
										agentHere && 'bg-lime-soft/60',
									)}
								>
									<span
										className={cn(
											'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] text-[10px] transition-all duration-300',
											done && 'scale-110 border-lime bg-lime text-lime-ink',
											current && !done && 'border-lime shadow-[0_0_0_4px_var(--lime-soft)]',
											!done && !current && 'border-border',
											agentHere && 'animate-pulse',
										)}
									>
										{done ? <Check size={10} strokeWidth={3} /> : agentHere ? <Bot size={10} /> : null}
									</span>
									<span className='truncate'>
										{/* sem o Motor, "Perguntas" é o roteiro da entrevista humana */}
										{t(
											name === 'questions' && !comEntrevista
												? 'jobForm.step.questionsManual'
												: `jobForm.step.${name}`,
										)}
									</span>
								</button>
							</li>
						)
					})}
				</ol>
				<p className='mt-4 px-2 text-[12.5px] text-muted'>
					{recovered
						? t('jobForm.draftRestored', { when: since(recovered.savedAt, i18n.language) })
						: t('jobForm.saveDraft')}
				</p>
			</aside>

			<div className='min-w-0'>
			{/*
			 * O título da vaga como o protótipo mostra: Sora em cima do formulário,
			 * com a linha de contexto embaixo. É o que faz a tela ler como UMA vaga
			 * sendo montada, e não como um formulário genérico.
			 */}
			{draft.jobName.trim() && step !== 'basics' && (
				<div className='rise mb-4'>
					<h2 className='font-display text-[22px] font-bold leading-tight tracking-[-0.01em]'>{draft.jobName}</h2>
					<p className='mt-1 text-[13px] text-muted'>
						{[draft.jobCategories, draft.carrerLevel, draft.contractType, [draft.city, draft.state].filter(Boolean).join(', '), draft.salary]
							.filter(Boolean)
							.join(' · ')}
					</p>
				</div>
			)}
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

			{/*
			 * O modelo do cargo, no momento em que ele passa a fazer sentido.
			 *
			 * Aparece só no passo Básico e só depois que há um cargo escrito: antes
			 * disso não há como saber QUAL modelo, e um seletor de modelos vazio na
			 * abertura da tela é mais uma decisão antes de escrever a primeira letra.
			 */}
			{step === 'basics' && sugestao && (
				<div className='mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-lime-mid bg-lime-soft px-3.5 py-2.5'>
					<div className='min-w-0 flex-1'>
						<p className='text-[12.5px] font-medium text-text'>
							{t('jobForm.templateSuggestion', { name: sugestao.name })}
						</p>
						<p className='text-[12px] text-text-2'>{t('jobForm.templateSuggestionHint')}</p>
					</div>
					<Button variant='secondary' size='sm' onClick={aplicarSugestao}>
						{t('jobForm.templateSuggestionApply')}
					</Button>
					<button
						onClick={() => setModeloAplicado(true)}
						className='text-[12px] text-muted underline-offset-2 hover:underline'
					>
						{t('jobForm.templateSuggestionDismiss')}
					</button>
				</div>
			)}

			<Card>
				{step === 'basics' && <BasicsStep draft={draft} set={set} falta={falta} quiet={agent.registered} />}
				{step === 'description' && <DescriptionStep draft={draft} set={set} falta={falta} quiet={agent.registered} />}
				{step === 'competencies' && (
					<CompetenciesStep
						draft={draft}
						onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
						awaitingAgent={agent.registered && !draft.competencias_criticas.trim()}
					/>
				)}
				{step === 'interview' && <InterviewStep draft={draft} set={set} />}
				{step === 'questions' && (
					<QuestionsStep
						draft={draft}
						onChange={(questions) => set('jobQuestions', questions)}
					/>
				)}
				{step === 'review' && <ReviewStep draft={draft} comEntrevista={comEntrevista} />}
			</Card>

			{error && (
				<p className='mt-3 rounded-lg border border-border bg-danger-soft px-3 py-2 text-[12px] text-danger'>
					{error}
				</p>
			)}

			<div className='mt-4 flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<Button
						variant='secondary'
						disabled={stepIndex === 0}
						onClick={() => setStep(steps[stepIndex - 1])}
					>
						<ArrowLeft size={13} /> {t('jobForm.previous')}
					</Button>

					{/*
					 * Sair sem perder o trabalho.
					 *
					 * O rascunho local (localStorage) morre com o navegador e não
					 * atravessa máquina — quem escreve a vaga no computador do
					 * escritório precisa encontrá-la em casa. Só na criação: vaga que
					 * já existe é salva pelo botão de sempre.
					 */}
					{!editing && (
						<Button
							variant='ghost'
							disabled={!draft.jobName.trim() || create.isPending}
							onClick={() => {
								setSalvandoRascunho(true)
								void submit(true)
							}}
						>
							{create.isPending && salvandoRascunho ? (
								<Loader2 size={13} className='animate-spin' />
							) : (
								<FileText size={13} />
							)}
							{t('jobForm.saveDraft')}
						</Button>
					)}
				</div>

				{step === 'review' ? (
					<span className='inline-flex items-center gap-3'>
					{!features.motor && <span className='text-[12px] text-muted'>{t('jobForm.agent.publishYours')}</span>}
					<Button variant='primary' onClick={() => setConfirming(true)} disabled={create.isPending || patch.isPending}>
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
					</span>
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
			</div>

			{/*
			 * "Seu agente" — a coluna do protótipo. Quem desenha o chat é o
			 * navegador; o que a página controla (e mostra aqui) é o CONTRATO que
			 * ela oferece e as chamadas que recebeu. Sem suporte no navegador, a
			 * coluna explica o que é e como ligar — a porta existe antes de o
			 * agente chegar, senão ninguém descobre que ela está lá.
			 */}
			{!features.motor && (
				<aside
					// em tela média ocupa a largura toda embaixo do formulário; só em tela
					// larga vira a terceira coluna (espremido embaixo dos passos não é opção)
					className='rise rounded-2xl border border-border bg-card-alt p-4 lg:col-span-2 xl:sticky xl:top-0 xl:col-span-1'
					style={stagger(2)}
				>
					<div className='mb-3 flex items-center justify-between gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>
						<span>{t('jobForm.agent.who')}</span>
						<span className='rounded-md border border-amber/50 px-1.5 py-px text-[9.5px] text-amber'>{t('jobForm.agent.experimental')}</span>
					</div>
					<Badge tone={agent.filling ? 'lime' : agent.registered ? 'lime' : 'neutral'}>
						<Bot size={11} /> {t('jobForm.agent.name')}
					</Badge>
					<p className='mt-2.5 text-[13px] leading-snug text-text-2'>
						{agent.registered
							? agent.filling
								? t('jobForm.agent.filling', {
										step: t(
											agent.filling === 'questions' && !comEntrevista
												? 'jobForm.step.questionsManual'
												: `jobForm.step.${agent.filling}`,
										),
									})
								: t('jobForm.agent.ready')
							: t('jobForm.agent.how')}
					</p>
					{!agent.registered && (
						<p className='mt-2.5 rounded-lg border border-dashed border-amber/50 bg-amber-soft/60 px-3 py-2 font-mono text-[11px] leading-snug text-amber'>
							{t('jobForm.agent.unsupported')}
						</p>
					)}

					<div className='mt-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>
						{agent.registered ? t('jobForm.agent.didTitle') : t('jobForm.agent.contract')}
					</div>
					{agent.registered ? (
						agent.calls.length === 0 ? (
							<p className='mt-2 text-[12.5px] text-muted'>{t('jobForm.agent.noCalls')}</p>
						) : (
							<ol className='mt-1'>
								{agent.calls.map((call, i) => (
									<li
										key={call.at + call.tool}
										className={cn(
											'rise border-b border-dashed border-border py-1.5 font-mono text-[11.5px]',
											i === agent.calls.length - 1 ? 'text-text' : 'text-muted',
										)}
									>
										{/* frase de gente; o nome da ferramenta fica pequeno, para quem quiser conferir */}
										<span className='font-sans text-[13px] text-text'>
											{t(`jobForm.agent.did.${call.tool}`, {
												facts: call.detail?.facts ?? '',
												count: call.detail?.count ?? 0,
												defaultValue: call.tool,
											})}
										</span>
										<span className='ml-1.5 text-[10.5px] text-muted'>{call.tool}</span>
									</li>
								))}
							</ol>
						)
					) : (
						<ol className='mt-1'>
							{AGENT_TOOL_NAMES.map((name) => (
								<li key={name} className='border-b border-dashed border-border py-1.5 font-mono text-[11.5px] text-text-2'>
									<b className='font-medium text-lime-fg'>{name}</b>()
								</li>
							))}
						</ol>
					)}
					{/*
					 * Duas ações, porque um painel que só espera não mostra nada: o
					 * pedido pronto para colar no assistente do navegador, e a
					 * demonstração — um agente de exemplo chamando as MESMAS
					 * ferramentas, com as chamadas caindo no log e os passos fechando.
					 */}
					<Button variant='secondary' size='sm' className='mt-4' onClick={() => setAgentHelp(true)}>
						<CircleHelp size={12} /> {t('jobForm.agent.help')}
					</Button>
					<p className='mt-4 text-[12px] text-muted'>{t('jobForm.agent.publishYours')}</p>
				</aside>
			)}
			</div>
			{/* a ajuda do agente: o que é, como usar, como ajuda — e o pedido pronto */}
			{agentHelp && (
				<div
					className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
					onClick={() => setAgentHelp(false)}
				>
					<div
						role='dialog'
						aria-modal='true'
						onClick={(e) => e.stopPropagation()}
						className='rise w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-pop)]'
					>
						<div className='font-mono text-[10.5px] uppercase tracking-[0.14em] text-lime-fg'>WebMCP</div>
						<h2 className='mt-1 font-display text-[22px] font-bold tracking-[-0.01em]'>{t('jobForm.agent.name')}</h2>
						<p className='mt-2 text-[13.5px] leading-relaxed text-text-2'>{t('jobForm.agent.helpWhat')}</p>
						<h3 className='mt-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>{t('jobForm.agent.helpHowTitle')}</h3>
						<ol className='mt-1.5 flex flex-col gap-1.5 text-[13.5px] leading-snug text-text-2'>
							{['helpHow1', 'helpHow2', 'helpHow3'].map((k, i) => (
								<li key={k} className='flex gap-2.5'>
									<span className='font-mono text-[11px] text-lime-fg'>{String(i + 1).padStart(2, '0')}</span>
									<span>{t(`jobForm.agent.${k}`)}</span>
								</li>
							))}
						</ol>
						<h3 className='mt-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>{t('jobForm.agent.helpWhyTitle')}</h3>
						<p className='mt-1.5 text-[13.5px] leading-relaxed text-text-2'>{t('jobForm.agent.helpWhy')}</p>
						<div className='mt-4 rounded-[10px] border border-border bg-bg p-3'>
							<p className='font-mono text-[12px] leading-relaxed text-text'>{t('jobForm.agent.prompt')}</p>
							<Button
								variant='primary'
								size='sm'
								className='mt-3'
								onClick={() => {
									void navigator.clipboard?.writeText(t('jobForm.agent.prompt'))
									setPromptCopied(true)
									setTimeout(() => setPromptCopied(false), 2000)
								}}
							>
								{promptCopied ? <Check size={12} /> : null}
								{promptCopied ? t('jobForm.agent.copied') : t('jobForm.agent.copyPrompt')}
							</Button>
						</div>
						<div className='mt-4 flex justify-end'>
							<Button variant='secondary' onClick={() => setAgentHelp(false)}>{t('jobForm.agent.close')}</Button>
						</div>
					</div>
				</div>
			)}

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
							{/* vaga sem entrevista só mostra a linha se há roteiro: "0" seria ruído */}
							{(comEntrevista || draft.jobQuestions.length > 0) && (
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

/**
 * As áreas de vaga que ESTA empresa pode escolher.
 *
 * Vêm do servidor: são as nossas mais as que a empresa cadastrou em
 * Configuração › Formulários. A lista fixa do bundle continua como rede —
 * enquanto a chamada não volta, ou se ela falhar, o select já abre preenchido em
 * vez de piscar vazio e fazer a pessoa achar que a vaga perdeu a categoria.
 */
function useAreasDeVaga(): string[] {
	const { data } = empresa.useGetCompaniesJobCategories()
	const doServidor = (data?.data as { all?: string[] } | undefined)?.all ?? []
	return doServidor.length > 0 ? doServidor : CATEGORIES
}

function BasicsStep({
	draft,
	set,
	falta,
	quiet = false,
}: {
	draft: JobDraft
	set: SetFn
	falta: FaltaFn
	/** agente registrado: a explicação vive no contrato */
	quiet?: boolean
}) {
	const areasDaVaga = useAreasDeVaga()
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
			<Hint quiet={quiet}>{t('jobForm.hints.basics')}</Hint>

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
						options={areasDaVaga.map((value) => ({ value, label: value }))}
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

function DescriptionStep({
	draft,
	set,
	falta,
	quiet = false,
}: {
	draft: JobDraft
	set: SetFn
	falta: FaltaFn
	quiet?: boolean
}) {
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
			<Hint quiet={quiet}>{t(features.motor ? 'jobForm.hints.description' : 'jobForm.hints.descriptionManual')}</Hint>
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

/**
 * Modos que esta instalação executa — mais o modo já gravado na vaga, quando
 * for um que a edição não oferece. Sem essa cauda o select ficaria VAZIO numa
 * vaga herdada e a primeira gravação apagaria o modo sem ninguém pedir.
 */
function modosDisponiveis(
	temWhatsapp: boolean,
	atual: JobDraft['interviewMode'],
): JobDraft['interviewMode'][] {
	const modos: JobDraft['interviewMode'][] = temWhatsapp
		? ['video', 'voice', 'whatsapp']
		: ['video', 'voice']
	return modos.includes(atual) ? modos : [...modos, atual]
}

/** Mesma regra da lista de modos, para o tipo legado "whatsapp". */
function tiposDisponiveis(
	temWhatsapp: boolean,
	atual: JobDraft['typeInterview'],
): JobDraft['typeInterview'][] {
	const tipos: JobDraft['typeInterview'][] = temWhatsapp
		? ['interview', 'evaluation', 'emotional', 'whatsapp']
		: ['interview', 'evaluation', 'emotional']
	return tipos.includes(atual) ? tipos : [...tipos, atual]
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
			{/*
			 * O TIPO "whatsapp" é herança da v1 (`AssessmentTypeEnum.WHATSAPP`) e
			 * não é o mesmo que o MODO WhatsApp do campo ao lado — dois campos
			 * vizinhos com a mesma palavra e significados diferentes. Some onde o
			 * canal não existe: numa instalação open a palavra só confundiria, já
			 * que nenhum dos dois sentidos roda ali. No SaaS continua, porque há
			 * vaga antiga gravada assim.
			 */}
			<Field label={t('jobForm.interviewType')} hint={t('jobForm.interviewTypeHint')}>
				<Select
					value={draft.typeInterview}
					onChange={(v) => set('typeInterview', v as JobDraft['typeInterview'])}
					options={tiposDisponiveis(features.whatsapp, draft.typeInterview).map((value) => ({
						value,
						label: t(`interviewTypes.${value}`),
					}))}
				/>
			</Field>
			{/*
			 * WhatsApp só onde o canal existe. O app que atende o webhook é da
			 * Coploy e não vai no plugin — oferecer o modo numa instalação open
			 * criaria vaga que ninguém atende do outro lado, e o candidato ficaria
			 * esperando uma conversa que nunca começa.
			 */}
			<Field label={t('jobForm.interviewMode')}>
				<Select
					value={draft.interviewMode}
					onChange={(v) => set('interviewMode', v as JobDraft['interviewMode'])}
					options={modosDisponiveis(features.whatsapp, draft.interviewMode).map((value) => ({
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

			{/*
			 * Retorno automático ao candidato (decisão do Henrique, 28/08).
			 *
			 * A dica diz o que acontece ao DESLIGAR, não o que a chave faz: este
			 * e-mail é a promessa anti-ghosting do produto, e quem desliga precisa
			 * saber que o candidato termina a entrevista e não ouve nada.
			 */}
			<label className='flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 md:col-span-2 xl:col-span-3'>
				<input
					type='checkbox'
					checked={draft.sendCandidateFeedback}
					onChange={(e) => set('sendCandidateFeedback', e.target.checked)}
					className='mt-0.5 h-3.5 w-3.5 accent-[var(--lime)]'
				/>
				<span>
					<span className='block text-[12.5px] font-medium'>
						{t('jobForm.sendCandidateFeedback')}
					</span>
					<span className='block text-[11.5px] text-text-2'>
						{t(
							draft.sendCandidateFeedback
								? 'jobForm.sendCandidateFeedbackHint'
								: 'jobForm.sendCandidateFeedbackOffHint',
						)}
					</span>
				</span>
			</label>

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

function ReviewStep({
	draft,
	comEntrevista,
}: {
	draft: JobDraft
	/** Da VAGA, não da instalação: com o Motor há vagas dos dois tipos. */
	comEntrevista: boolean
}) {
	const { t } = useTranslation()
	/*
	 * A revisão mostra a VAGA, não cinco linhas. Quem chega aqui depois de um
	 * agente preencher tudo precisa ler o que vai ao ar: descrição, requisitos,
	 * competências e o roteiro — e não só nome, nível e régua.
	 */
	const fatos: Array<[string, string]> = [
		[t('jobForm.jobName'), draft.jobName || '—'],
		[t('jobForm.identifier'), draft.identifier || '—'],
		[t('jobForm.category'), draft.jobCategories || '—'],
		[t('jobForm.level'), draft.carrerLevel || '—'],
		[t('jobForm.contract'), [draft.contractType, draft.jobModel].filter(Boolean).join(' · ') || '—'],
		[t('jobForm.country'), [draft.city, draft.state, draft.country].filter(Boolean).join(', ') || '—'],
		[t('jobForm.salary'), draft.salary || '—'],
		[t('jobForm.closingDate'), draft.closingDate || '—'],
		[t('jobForm.sla'), t('jobConfig.slaPreset', { hours: draft.feedbackSlaHours })],
		...(comEntrevista
			? ([[t('jobForm.interviewType'), t(`interviewTypes.${draft.typeInterview}`)]] as Array<[string, string]>)
			: []),
	]
	const chips = (text: string) =>
		text
			.split('\n')
			.map((l) => l.trim().replace(/^[-•*]\s*/, ''))
			.filter(Boolean)
			.map((l) => l.split(/\s[—–-]\s|:\s/)[0].trim())
	const criticas = chips(draft.competencias_criticas)
	const adicionais = chips(draft.competencias_adicionais)
	const Texto = ({ titulo, valor }: { titulo: string; valor: string }) =>
		valor.trim() ? (
			<section>
				<h3 className='mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>{titulo}</h3>
				<Markdown text={valor} className='rounded-[10px] border border-border bg-bg px-3.5 py-3 text-[13.5px]' />
			</section>
		) : null

	return (
		<div className='flex flex-col gap-5'>
			<p className='text-[13px] text-text-2'>{t('jobForm.reviewHelp')}</p>

			<dl className='grid gap-x-6 gap-y-1 rounded-[10px] border border-border bg-bg px-4 py-3 md:grid-cols-2'>
				{fatos.map(([label, value]) => (
					<div key={label} className='flex items-baseline justify-between gap-4 border-b border-border-soft py-1.5'>
						<dt className='font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted'>{label}</dt>
						<dd className='truncate text-[13.5px] font-semibold'>{value}</dd>
					</div>
				))}
			</dl>

			<Texto titulo={t('jobForm.description')} valor={draft.jobDescription} />
			<Texto titulo={t('jobForm.requirements')} valor={draft.jobRequirements} />
			<Texto titulo={t('jobForm.responsibilities')} valor={draft.jobResponsabilities} />
			<Texto titulo={t('jobForm.benefits')} valor={draft.benefits} />

			{(criticas.length > 0 || adicionais.length > 0) && (
				<section>
					<h3 className='mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>
						{t('jobForm.criticalCompetencies')} · {t('jobForm.additionalCompetencies')}
					</h3>
					<div className='flex flex-wrap gap-1.5'>
						{criticas.map((c, i) => (
							<span key={'c' + i} className='rounded-full bg-lime-soft px-2.5 py-[3px] text-[12.5px] font-semibold text-lime-fg'>
								{c}
							</span>
						))}
						{adicionais.map((c, i) => (
							<span key={'a' + i} className='rounded-full border border-border px-2.5 py-[3px] text-[12.5px] text-text-2'>
								{c}
							</span>
						))}
					</div>
					{draft.expectativas.trim() && <p className='mt-2 text-[13px] text-text-2'>{draft.expectativas}</p>}
				</section>
			)}

			{draft.jobQuestions.length > 0 && (
				<section>
					<h3 className='mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted'>
						{t(comEntrevista ? 'jobForm.step.questions' : 'jobForm.step.questionsManual')} · {draft.jobQuestions.length}
					</h3>
					<ol className='flex flex-col divide-y divide-border-soft rounded-[10px] border border-border bg-bg px-3.5'>
						{draft.jobQuestions.map((q, i) => (
							<li key={i} className='flex gap-3 py-2.5 text-[13.5px]'>
								<span className='font-mono text-[11px] text-lime-fg'>{String(i + 1).padStart(2, '0')}</span>
								<span className='min-w-0'>
									{q.question}
									{q.competence && <span className='ml-2 text-[12px] text-muted'>· {q.competence}</span>}
								</span>
							</li>
						))}
					</ol>
				</section>
			)}

			<p className='rounded-lg border border-lime-mid bg-lime-soft px-3 py-2 text-[12.5px] text-text'>
				{t('jobForm.reviewNotice')}
			</p>
		</div>
	)
}
