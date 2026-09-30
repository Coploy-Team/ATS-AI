import type { JobDraft } from './job-form-page'
import { CATEGORIES, CONTRACTS, LEVELS, MODELS, chave, resolverOpcao } from './job-options'

/**
 * "Preencher com o seu agente" — plano D.
 *
 * Sem o Motor, quem escreve a vaga não tem gerador nenhum. Este módulo registra
 * ferramentas WebMCP no navegador (`document.modelContext`) para que o agente
 * que a pessoa JÁ tem (o assistente do próprio navegador) preencha o
 * formulário seguindo a régua da Coploy — que é o prompt do Motor virando
 * contrato, em `WRITING_GUIDE`. Publicar continua humano: não existe
 * ferramenta de publicar, por decisão (D2).
 *
 * Nada aqui importa React: o formulário entrega um `AgentHost` (ler/escrever o
 * rascunho, mover de passo) e este módulo só valida e escreve. É o que permite
 * provar as ferramentas contra um `modelContext` falso, sem navegador.
 *
 * A API é experimental e mudou de nome uma vez (`navigator.` →
 * `document.modelContext`); `registerTools` aceita as duas formas
 * (`registerTool` por ferramenta ou `provideContext` com a lista) e nunca
 * deixa uma exceção do navegador derrubar o formulário.
 */

// ---------------------------------------------------------------------------
// A régua — essência dos prompts do Motor (ai-engine/job-description)
// ---------------------------------------------------------------------------

/** Cabeçalhos das seções no idioma da vaga. O Markdown gravado usa estes. */
export function sectionHeadings(language: string) {
	return language.toLowerCase().startsWith('pt')
		? {
				dayToDay: '## Como será o seu dia a dia',
				mustHave: '## O que você precisa ter',
				niceToHave: '## Diferenciais',
			}
		: {
				dayToDay: '## What your day-to-day will look like',
				mustHave: '## What you need to have',
				niceToHave: '## Nice to have',
			}
}

export const QUESTION_TYPES = ['technical', 'behavioral', 'situational', 'architectural'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

/** Limite do Motor: pergunta mais longa que isso vira parágrafo, não pergunta. */
export const MAX_QUESTION_CHARS = 350

export const WRITING_GUIDE = {
	language:
		'Write every text in the job language (`draft.language`, default pt-BR). Headings below are given in pt-BR and en; use the ones matching the language.',
	tone: 'Direct, technical and objective, second person ("você"/"you"). Talk about the problem the role solves, not a list of technologies. Prefer specific technical knowledge over academic credentials. Bold only for key technologies; no tables, no links.',
	description: {
		format: 'Markdown, job-portal style, in this exact order.',
		sections: [
			'intro: 1–2 paragraphs presenting the role — what the team does and why this role matters',
			'"## Como será o seu dia a dia" / "## What your day-to-day will look like": bullet list, short sentences starting with a verb',
			'"## O que você precisa ter" / "## What you need to have": bullet list of must-have requirements',
			'"## Diferenciais" / "## Nice to have": bullet list of differentials',
		],
		benefits: 'Optional bullet list, one benefit per bullet ("**Saúde** — plano médico").',
	},
	competencies: {
		critical: '3 to 5 competencies the interview MUST score. Each with a short "how to observe" — what a good answer shows.',
		additional: '2 to 4 competencies that differentiate candidates. Same shape.',
		expectations: 'One paragraph: what is expected from whoever holds the position at this level.',
	},
	interview: {
		perQuestion: [
			'Tie it directly to one responsibility or one technical requirement',
			'Evaluate at least one listed competency (critical or additional)',
			'Match the complexity to the job level',
			'Specific and objective; never answerable with yes/no; no personal data or discriminatory topics',
			`At most ${MAX_QUESTION_CHARS} characters; do not say what is being evaluated`,
		],
		mix: '30% technical experience with the listed requirements, 30% main responsibilities, 20% critical competencies, 20% additional competencies. Do not repeat a competency across questions.',
		types: {
			technical: 'real problems related to the requirements',
			architectural: 'design decisions based on the responsibilities',
			behavioral: 'past situations aligned to the competencies — STAR: situation (real context), task (specific challenge), action (what they did, at the expected level), result (outcome aligned to the expectations)',
			situational: 'hypothetical scenarios based on the job description',
		},
		count: 'Five questions usually suffice (~15 min). Fewer is better than generic.',
	},
	flow: 'Call get_job_form first, then set_job_basics → set_job_description → set_competencies → set_interview_questions. Every write returns what is still missing. The recruiter reviews and publishes — there is no publish tool.',
} as const

// ---------------------------------------------------------------------------
// Contrato das ferramentas
// ---------------------------------------------------------------------------

export type ToolError = { field: string; message: string }
export type ToolResult =
	| { ok: true; step: string; missing: string[]; pending: string[]; [key: string]: unknown }
	| { ok: false; errors: ToolError[] }

export interface AgentTool {
	name: string
	description: string
	inputSchema: Record<string, unknown>
	run(input: unknown): ToolResult
}

/** O que o formulário entrega ao módulo. Lê SEMPRE o estado atual (refs). */
export interface AgentHost {
	getDraft(): JobDraft
	patchDraft(patch: Partial<JobDraft>): void
	getStep(): string
	setStep(step: string): void
	/** A trilha desta edição — sem o Motor, `basics → description → competencies → questions → review`. */
	steps: readonly string[]
	/** As áreas que o formulário oferece (as da empresa, ou a lista padrão). */
	areas?: string[]
	/** Chamado a cada ferramenta executada — é o que acende "preenchendo". */
	onCall?(tool: string, step: string, detail?: AgentCallDetail): void
}

/** O que ainda impede publicar — a mesma régua do formulário (`pendencias`). */
export function missingFields(draft: JobDraft): string[] {
	const missing: string[] = []
	if (draft.jobName.trim().length <= 2) missing.push('jobName')
	if (!draft.carrerLevel.trim()) missing.push('carrerLevel')
	if (!draft.jobCategories.trim()) missing.push('jobCategories')
	if (!draft.jobDescription.trim()) missing.push('jobDescription')
	if (!draft.jobResponsabilities.trim()) missing.push('jobResponsabilities')
	if (!draft.jobRequirements.trim()) missing.push('jobRequirements')
	return missing
}

/** O que a régua pede e o formulário não exige: some quando preenchido. */
export function pendingSections(draft: JobDraft): string[] {
	const pending: string[] = []
	if (!draft.competencias_criticas.trim()) pending.push('competencies')
	if (!draft.jobQuestions.some((item) => item.question.trim())) pending.push('questions')
	return pending
}

// ---------------------------------------------------------------------------
// Validação — sem biblioteca: o input é JSON e as regras cabem em funções
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(input: Record<string, unknown>, field: string, errors: ToolError[], required: boolean): string | undefined {
	const value = input[field]
	if (value === undefined || value === null) {
		if (required) errors.push({ field, message: 'required' })
		return undefined
	}
	if (typeof value !== 'string') {
		errors.push({ field, message: 'must be a string' })
		return undefined
	}
	const trimmed = value.trim()
	if (required && !trimmed) errors.push({ field, message: 'required' })
	return trimmed
}

function textList(
	input: Record<string, unknown>,
	field: string,
	errors: ToolError[],
	required: boolean,
): string[] | undefined {
	const value = input[field]
	if (value === undefined || value === null) {
		if (required) errors.push({ field, message: 'required (non-empty list of strings)' })
		return undefined
	}
	if (!Array.isArray(value)) {
		errors.push({ field, message: 'must be a list of strings' })
		return undefined
	}
	const items: string[] = []
	value.forEach((item, index) => {
		if (typeof item !== 'string' || !item.trim()) {
			errors.push({ field: `${field}[${index}]`, message: 'must be a non-empty string' })
			return
		}
		items.push(item.trim())
	})
	if (required && items.length === 0) errors.push({ field, message: 'required (non-empty list of strings)' })
	return items
}

/** Valor de lista fechada — resolve rótulo pt, rótulo en e apelidos; fora disso é erro. */
function option(
	input: Record<string, unknown>,
	field: string,
	list: typeof LEVELS,
	errors: ToolError[],
	required: boolean,
): string | undefined {
	const raw = text(input, field, errors, required)
	if (raw === undefined || raw === '') return undefined
	const resolved = resolverOpcao(raw, list)
	if (!resolved) {
		errors.push({
			field,
			message: `unknown value "${raw}". Allowed: ${list.map((item) => item.value).join(' | ')}`,
		})
		return undefined
	}
	return resolved
}

/** Área: casa por rótulo, sem acento e sem caixa, contra a lista do formulário. */
export function resolveArea(raw: string, areas: string[]): string {
	const target = chave(raw)
	return areas.find((item) => chave(item) === target) ?? ''
}

function bullets(items: string[]): string {
	return items.map((item) => `- ${item.replace(/^[-*•]\s*/, '')}`).join('\n')
}

// ---------------------------------------------------------------------------
// As ferramentas
// ---------------------------------------------------------------------------

function nextStepAfter(host: AgentHost, completed: string): string {
	const order = host.steps
	const done = order.indexOf(completed)
	const current = order.indexOf(host.getStep())
	if (done >= 0 && done + 1 < order.length && current <= done) return order[done + 1]
	return host.getStep()
}

/** O que a tela conta sobre a chamada — fatos e contagem; as palavras são do i18n. */
export interface AgentCallDetail {
	facts?: string
	count?: number
}
export function describeCall(tool: string, input: unknown): AgentCallDetail {
	const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
	const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)
	switch (tool) {
		case 'set_job_basics':
			return { facts: [o.title, o.area, o.level].filter((v) => typeof v === 'string' && v).join(' · ') }
		case 'set_job_description':
			return { count: ['intro', 'dayToDay', 'responsibilities', 'mustHave', 'niceToHave', 'benefits'].filter((k) => o[k] !== undefined && o[k] !== null && (typeof o[k] === 'string' ? (o[k] as string).trim() : len(o[k]) > 0)).length }
		case 'set_competencies':
			return { count: len(o.critical) + len(o.additional) }
		case 'set_interview_questions':
			return { count: len(o.questions) }
		default:
			return {}
	}
}

function finish(
	host: AgentHost,
	tool: string,
	completed: string | null,
	extra: Record<string, unknown> = {},
	detail?: AgentCallDetail,
): ToolResult {
	const step = completed ? nextStepAfter(host, completed) : host.getStep()
	if (completed && step !== host.getStep()) host.setStep(step)
	host.onCall?.(tool, step, detail)
	const draft = host.getDraft()
	return { ok: true, step, missing: missingFields(draft), pending: pendingSections(draft), ...extra }
}

/** Os campos do rascunho que o agente pode ler — todos: não há segredo no rascunho. */
function publicDraft(draft: JobDraft) {
	return {
		title: draft.jobName,
		identifier: draft.identifier,
		level: draft.carrerLevel,
		area: draft.jobCategories,
		model: draft.jobModel,
		contract: draft.contractType,
		language: draft.language,
		salary: draft.salary,
		location: { country: draft.country, state: draft.state, city: draft.city },
		description: draft.jobDescription,
		responsibilities: draft.jobResponsabilities,
		requirements: draft.jobRequirements,
		benefits: draft.benefits,
		mainSkills: draft.mainSkills,
		criticalCompetencies: draft.competencias_criticas,
		additionalCompetencies: draft.competencias_adicionais,
		expectations: draft.expectativas,
		questions: draft.jobQuestions.map((item) => ({ text: item.question, competency: item.competence ?? '' })),
		public: draft.public,
	}
}

/** Os nomes, na ordem em que o agente costuma chamar — o painel lista antes de haver suporte. */
export const AGENT_TOOL_NAMES = [
	'get_writing_guide',
	'get_job_form',
	'set_job_basics',
	'set_job_description',
	'set_competencies',
	'set_interview_questions',
] as const

export function buildAgentTools(host: AgentHost): AgentTool[] {
	const areas = () => (host.areas && host.areas.length > 0 ? host.areas : CATEGORIES)

	const getWritingGuide: AgentTool = {
		name: 'get_writing_guide',
		description:
			'Read this first. Returns the writing rules for a job posting on this ATS (description structure, competencies, interview questions) and the allowed values for area, level, contract and work model.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		run() {
			return finish(host, 'get_writing_guide', null, {
				guide: WRITING_GUIDE,
				headings: sectionHeadings(host.getDraft().language),
				vocabulary: {
					areas: areas(),
					levels: LEVELS.map((item) => item.value),
					contracts: CONTRACTS.map((item) => item.value),
					models: MODELS.map((item) => item.value),
					questionTypes: QUESTION_TYPES,
				},
			})
		},
	}

	const getJobForm: AgentTool = {
		name: 'get_job_form',
		description:
			'Returns the current state of the job form: the step the recruiter is on, what is filled, what is still missing, and the draft itself.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		run() {
			return finish(host, 'get_job_form', null, {
				steps: host.steps,
				draft: publicDraft(host.getDraft()),
			})
		},
	}

	const setJobBasics: AgentTool = {
		name: 'set_job_basics',
		description:
			'Sets title, area and level of the job (plus optional contract, location, salary and skills) and moves the form to the description step. Area and level must come from get_writing_guide vocabulary. Always send skills: they are the tags recruiters filter by.',
		inputSchema: {
			type: 'object',
			properties: {
				title: { type: 'string', description: 'Job title as the market calls it' },
				area: { type: 'string', description: 'One of vocabulary.areas' },
				level: { type: 'string', description: 'One of vocabulary.levels' },
				contract: { type: 'string', description: 'One of vocabulary.contracts' },
				location: {
					type: 'object',
					properties: {
						country: { type: 'string' },
						state: { type: 'string' },
						city: { type: 'string' },
						model: { type: 'string', description: 'One of vocabulary.models' },
					},
					additionalProperties: false,
				},
				salary: { type: 'string', description: 'Free text, e.g. "R$ 6.000–8.000" or "A combinar"' },
				skills: {
					type: 'array',
					items: { type: 'string' },
					description: 'Main skills or technologies as short tags, 3–8 items (e.g. "Excel", "Node.js")',
				},
			},
			required: ['title', 'area', 'level'],
			additionalProperties: false,
		},
		run(input) {
			if (!isRecord(input)) return { ok: false, errors: [{ field: '*', message: 'input must be an object' }] }
			const errors: ToolError[] = []
			const title = text(input, 'title', errors, true)
			if (title !== undefined && title.length <= 2) errors.push({ field: 'title', message: 'too short (min 3 characters)' })
			const areaRaw = text(input, 'area', errors, true)
			const area = areaRaw ? resolveArea(areaRaw, areas()) : ''
			if (areaRaw && !area)
				errors.push({ field: 'area', message: `unknown value "${areaRaw}". Allowed: ${areas().join(' | ')}` })
			const level = option(input, 'level', LEVELS, errors, true)
			const contract = option(input, 'contract', CONTRACTS, errors, false)
			const salary = text(input, 'salary', errors, false)

			const patch: Partial<JobDraft> = {}
			if (isRecord(input.location)) {
				const location = input.location
				const model = option(location, 'model', MODELS, errors, false)
				const country = text(location, 'country', errors, false)
				const state = text(location, 'state', errors, false)
				const city = text(location, 'city', errors, false)
				if (model) patch.jobModel = model
				if (country) patch.country = country
				if (state !== undefined) patch.state = state
				if (city !== undefined) patch.city = city
			} else if (input.location !== undefined) {
				errors.push({ field: 'location', message: 'must be an object' })
			}
			if (errors.length > 0) return { ok: false, errors }

			patch.jobName = title
			patch.jobCategories = area
			patch.carrerLevel = level
			if (contract) patch.contractType = contract
			if (salary !== undefined) patch.salary = salary
			const skills = (input as { skills?: unknown }).skills
			if (Array.isArray(skills)) {
				const tags = skills.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
				if (tags.length > 0) patch.mainSkills = tags.join(', ')
			}
			host.patchDraft(patch)
			return finish(host, 'set_job_basics', 'basics', {}, describeCall('set_job_basics', input))
		},
	}

	const setJobDescription: AgentTool = {
		name: 'set_job_description',
		description:
			'Writes the job description in the ATS structure (intro, day-to-day, must-have, nice-to-have, benefits) as Markdown and moves the form to the competencies step. Lists are plain strings, one item each; do not include bullet characters.',
		inputSchema: {
			type: 'object',
			properties: {
				intro: { type: 'string', description: '1–2 paragraphs presenting the role' },
				dayToDay: { type: 'array', items: { type: 'string' }, description: 'Day-to-day activities, verb first' },
				responsibilities: {
					type: 'array',
					items: { type: 'string' },
					description: 'Main responsibilities, verb first. Defaults to dayToDay when omitted',
				},
				mustHave: { type: 'array', items: { type: 'string' }, description: 'Must-have requirements' },
				niceToHave: { type: 'array', items: { type: 'string' }, description: 'Differentials' },
				benefits: { type: 'array', items: { type: 'string' } },
			},
			required: ['intro', 'dayToDay', 'mustHave'],
			additionalProperties: false,
		},
		run(input) {
			if (!isRecord(input)) return { ok: false, errors: [{ field: '*', message: 'input must be an object' }] }
			const errors: ToolError[] = []
			const intro = text(input, 'intro', errors, true)
			const dayToDay = textList(input, 'dayToDay', errors, true)
			const responsibilities = textList(input, 'responsibilities', errors, false)
			const mustHave = textList(input, 'mustHave', errors, true)
			const niceToHave = textList(input, 'niceToHave', errors, false)
			const benefits = textList(input, 'benefits', errors, false)
			if (errors.length > 0 || !intro || !dayToDay || !mustHave) return { ok: false, errors }

			const headings = sectionHeadings(host.getDraft().language)
			const description = `${intro}\n\n${headings.dayToDay}\n\n${bullets(dayToDay)}`
			const requirements =
				`${headings.mustHave}\n\n${bullets(mustHave)}` +
				(niceToHave && niceToHave.length > 0 ? `\n\n${headings.niceToHave}\n\n${bullets(niceToHave)}` : '')
			const patch: Partial<JobDraft> = {
				jobDescription: description,
				jobRequirements: requirements,
				jobResponsabilities: bullets(responsibilities && responsibilities.length > 0 ? responsibilities : dayToDay),
			}
			if (benefits && benefits.length > 0) patch.benefits = bullets(benefits)
			host.patchDraft(patch)
			return finish(host, 'set_job_description', 'description', {}, describeCall('set_job_description', input))
		},
	}

	const setCompetencies: AgentTool = {
		name: 'set_competencies',
		description:
			'Sets the competencies the interview scores — critical (3–5) and additional (2–4), each with how to observe it — and moves the form to the interview script step.',
		inputSchema: {
			type: 'object',
			properties: {
				critical: {
					type: 'array',
					items: {
						type: 'object',
						properties: { name: { type: 'string' }, observe: { type: 'string' } },
						required: ['name', 'observe'],
						additionalProperties: false,
					},
				},
				additional: {
					type: 'array',
					items: {
						type: 'object',
						properties: { name: { type: 'string' }, observe: { type: 'string' } },
						required: ['name', 'observe'],
						additionalProperties: false,
					},
				},
				expectations: { type: 'string', description: 'What is expected from whoever holds the position' },
			},
			required: ['critical'],
			additionalProperties: false,
		},
		run(input) {
			if (!isRecord(input)) return { ok: false, errors: [{ field: '*', message: 'input must be an object' }] }
			const errors: ToolError[] = []
			const readList = (field: string, required: boolean): string[] | undefined => {
				const value = input[field]
				if (value === undefined || value === null) {
					if (required) errors.push({ field, message: 'required (non-empty list)' })
					return undefined
				}
				if (!Array.isArray(value)) {
					errors.push({ field, message: 'must be a list of { name, observe }' })
					return undefined
				}
				const lines: string[] = []
				value.forEach((item, index) => {
					if (!isRecord(item)) {
						errors.push({ field: `${field}[${index}]`, message: 'must be { name, observe }' })
						return
					}
					const name = text(item, 'name', [], true)
					const observe = text(item, 'observe', [], false)
					if (!name) {
						errors.push({ field: `${field}[${index}].name`, message: 'required' })
						return
					}
					lines.push(observe ? `${name} — ${observe}` : name)
				})
				if (required && lines.length === 0) errors.push({ field, message: 'required (non-empty list)' })
				return lines
			}
			const critical = readList('critical', true)
			const additional = readList('additional', false)
			const expectations = text(input, 'expectations', errors, false)
			if (errors.length > 0 || !critical) return { ok: false, errors }

			/* uma por linha: é o formato que o motor de avaliação e a v1 já leem */
			const patch: Partial<JobDraft> = { competencias_criticas: critical.join('\n') }
			if (additional) patch.competencias_adicionais = additional.join('\n')
			if (expectations !== undefined) patch.expectativas = expectations
			host.patchDraft(patch)
			return finish(host, 'set_competencies', 'competencies', {}, describeCall('set_competencies', input))
		},
	}

	const setInterviewQuestions: AgentTool = {
		name: 'set_interview_questions',
		description:
			'Sets the interview script (the questions a human interviewer will ask) and moves the form to review. Replaces the whole list. Follow the mix and per-question rules from get_writing_guide.',
		inputSchema: {
			type: 'object',
			properties: {
				questions: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							text: { type: 'string', description: `The question, at most ${MAX_QUESTION_CHARS} characters` },
							competency: { type: 'string', description: 'The competency it evaluates' },
							type: { type: 'string', enum: [...QUESTION_TYPES] },
							level: { type: 'string', description: 'Optional: the level the question is calibrated for' },
						},
						required: ['text', 'competency', 'type'],
						additionalProperties: false,
					},
				},
			},
			required: ['questions'],
			additionalProperties: false,
		},
		run(input) {
			if (!isRecord(input)) return { ok: false, errors: [{ field: '*', message: 'input must be an object' }] }
			const errors: ToolError[] = []
			const value = input.questions
			if (!Array.isArray(value) || value.length === 0) {
				return { ok: false, errors: [{ field: 'questions', message: 'required (non-empty list)' }] }
			}
			const questions: JobDraft['jobQuestions'] = []
			value.forEach((item, index) => {
				if (!isRecord(item)) {
					errors.push({ field: `questions[${index}]`, message: 'must be { text, competency, type }' })
					return
				}
				const questionText = text(item, 'text', [], true)
				const competency = text(item, 'competency', [], true)
				const type = text(item, 'type', [], true)
				if (!questionText) errors.push({ field: `questions[${index}].text`, message: 'required' })
				else if (questionText.length > MAX_QUESTION_CHARS)
					errors.push({ field: `questions[${index}].text`, message: `too long (max ${MAX_QUESTION_CHARS} characters)` })
				if (!competency) errors.push({ field: `questions[${index}].competency`, message: 'required' })
				if (!type || !(QUESTION_TYPES as readonly string[]).includes(type))
					errors.push({ field: `questions[${index}].type`, message: `must be one of ${QUESTION_TYPES.join(' | ')}` })
				if (questionText && competency) questions.push({ question: questionText, competence: competency })
			})
			if (errors.length > 0) return { ok: false, errors }
			host.patchDraft({ jobQuestions: questions })
			return finish(host, 'set_interview_questions', 'questions', {}, describeCall('set_interview_questions', input))
		},
	}

	return [getWritingGuide, getJobForm, setJobBasics, setJobDescription, setCompetencies, setInterviewQuestions]
}

// ---------------------------------------------------------------------------
// Registro no navegador — adaptador tolerante às duas formas da API
// ---------------------------------------------------------------------------

/** O que o navegador expõe. Tudo opcional: a API é experimental. */
export interface ModelContextLike {
	registerTool?: (tool: RegisteredTool) => unknown
	unregisterTool?: (name: string) => unknown
	provideContext?: (context: { tools: RegisteredTool[] }) => unknown
	clearContext?: () => unknown
}

export interface RegisteredTool {
	name: string
	description: string
	inputSchema: Record<string, unknown>
	execute: (input: unknown) => Promise<unknown>
}

/** Resposta no formato de resultado de ferramenta (texto JSON + estruturado). */
function toRegistered(tool: AgentTool): RegisteredTool {
	return {
		name: tool.name,
		description: tool.description,
		inputSchema: tool.inputSchema,
		async execute(input) {
			let result: ToolResult
			try {
				result = tool.run(input ?? {})
			} catch (error) {
				result = { ok: false, errors: [{ field: '*', message: error instanceof Error ? error.message : String(error) }] }
			}
			return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }
		},
	}
}

/** `document.modelContext`, ou o nome antigo. `null` = navegador sem suporte. */
export function findModelContext(): ModelContextLike | null {
	try {
		if (typeof document !== 'undefined') {
			const fromDocument = (document as { modelContext?: ModelContextLike }).modelContext
			if (fromDocument) return fromDocument
		}
		if (typeof navigator !== 'undefined') {
			const fromNavigator = (navigator as { modelContext?: ModelContextLike }).modelContext
			if (fromNavigator) return fromNavigator
		}
	} catch {
		/* acesso à propriedade pode lançar em navegador que a bloqueia */
	}
	return null
}

/** A chave de build. Desligada = o formulário nem procura o navegador. */
export function webMcpEnabled(): boolean {
	return import.meta.env.VITE_WEBMCP === 'true'
}

/**
 * Registra e devolve o desregistro. Nunca lança: falha em uma ferramenta não
 * derruba as outras, e falha do navegador não derruba o formulário.
 */
export function registerTools(ctx: ModelContextLike, tools: AgentTool[]): () => void {
	const registered = tools.map(toRegistered)

	if (typeof ctx.registerTool === 'function') {
		const undo: Array<() => void> = []
		for (const tool of registered) {
			try {
				const returned = ctx.registerTool(tool)
				// a API pode devolver promise: recusa silenciosa em vez de rejeição solta
				if (returned && typeof (returned as Promise<unknown>).catch === 'function') {
					void (returned as Promise<unknown>).catch(() => undefined)
				}
				undo.push(() => {
					if (typeof returned === 'function') (returned as () => void)()
					else ctx.unregisterTool?.(tool.name)
				})
			} catch {
				/* segue para a próxima */
			}
		}
		return () => {
			for (const off of undo) {
				try {
					off()
				} catch {
					/* desregistrar é melhor esforço */
				}
			}
		}
	}

	if (typeof ctx.provideContext === 'function') {
		try {
			ctx.provideContext({ tools: registered })
		} catch {
			return () => undefined
		}
		return () => {
			try {
				if (typeof ctx.clearContext === 'function') ctx.clearContext()
				else ctx.provideContext?.({ tools: [] })
			} catch {
				/* idem */
			}
		}
	}

	return () => undefined
}
