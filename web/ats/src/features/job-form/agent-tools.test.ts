import { describe, expect, it } from 'vitest'

import {
	MAX_QUESTION_CHARS,
	buildAgentTools,
	registerTools,
	type AgentHost,
	type ModelContextLike,
	type RegisteredTool,
	type ToolResult,
} from './agent-tools'
import type { JobDraft } from './job-form-page'

/*
 * Sem Chrome com a origin trial aqui, a prova é esta: as ferramentas contra
 * um `modelContext` falso, nas duas formas da API, e a escrita no rascunho
 * com o mesmo vocabulário do formulário.
 */

const OPEN_STEPS = ['basics', 'description', 'competencies', 'questions', 'review'] as const

function makeDraft(): JobDraft {
	return {
		jobName: '',
		identifier: '',
		carrerLevel: '',
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
		sendCandidateFeedback: true,
		acceptsCoployProfile: true,
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
}

function makeHost(areas?: string[]) {
	const state = { draft: makeDraft(), step: 'basics' as string, calls: [] as Array<[string, string]> }
	const host: AgentHost = {
		getDraft: () => state.draft,
		patchDraft: (patch) => {
			state.draft = { ...state.draft, ...patch }
		},
		getStep: () => state.step,
		setStep: (step) => {
			state.step = step
		},
		steps: OPEN_STEPS,
		areas,
		onCall: (tool, step) => state.calls.push([tool, step]),
	}
	return { host, state }
}

function tool(host: AgentHost, name: string) {
	const found = buildAgentTools(host).find((item) => item.name === name)
	if (!found) throw new Error(`no tool ${name}`)
	return found
}

describe('registerTools', () => {
	it('registra as seis ferramentas por registerTool e desregistra ao desmontar', async () => {
		const registered: RegisteredTool[] = []
		const unregistered: string[] = []
		const ctx: ModelContextLike = {
			registerTool: (item) => {
				registered.push(item)
			},
			unregisterTool: (name) => {
				unregistered.push(name)
			},
		}
		const { host } = makeHost()
		const off = registerTools(ctx, buildAgentTools(host))

		expect(registered.map((item) => item.name)).toEqual([
			'get_writing_guide',
			'get_job_form',
			'set_job_basics',
			'set_job_description',
			'set_competencies',
			'set_interview_questions',
		])
		// decisão D2: o agente prepara, o humano publica
		expect(registered.some((item) => /publish|publicar|create_job/i.test(item.name))).toBe(false)

		// a resposta sai como resultado de ferramenta: texto JSON + estruturado
		const response = (await registered[0].execute({})) as {
			content: Array<{ type: string; text: string }>
			structuredContent: ToolResult
		}
		expect(response.content[0].type).toBe('text')
		expect(JSON.parse(response.content[0].text).ok).toBe(true)
		expect(response.structuredContent.ok).toBe(true)

		off()
		expect(unregistered).toEqual(registered.map((item) => item.name))
	})

	it('aceita a forma provideContext e limpa ao desmontar', () => {
		let provided: RegisteredTool[] = []
		let cleared = 0
		const ctx: ModelContextLike = {
			provideContext: ({ tools }) => {
				provided = tools
			},
			clearContext: () => {
				cleared += 1
			},
		}
		const { host } = makeHost()
		const off = registerTools(ctx, buildAgentTools(host))
		expect(provided).toHaveLength(6)
		off()
		expect(cleared).toBe(1)
	})

	it('uma ferramenta recusada não derruba as outras nem o formulário', () => {
		const names: string[] = []
		const ctx: ModelContextLike = {
			registerTool: (item) => {
				if (item.name === 'set_job_basics') throw new Error('nope')
				names.push(item.name)
			},
		}
		const { host } = makeHost()
		expect(() => registerTools(ctx, buildAgentTools(host))()).not.toThrow()
		expect(names).toHaveLength(5)
	})

	it('sem nenhuma das formas, registra nada e não lança', () => {
		const { host } = makeHost()
		expect(() => registerTools({}, buildAgentTools(host))()).not.toThrow()
	})

	it('execute nunca propaga exceção da ferramenta', async () => {
		const registered: RegisteredTool[] = []
		registerTools({ registerTool: (item) => void registered.push(item) }, [
			{
				name: 'boom',
				description: '',
				inputSchema: {},
				run: () => {
					throw new Error('boom')
				},
			},
		])
		const response = (await registered[0].execute({})) as { structuredContent: ToolResult }
		expect(response.structuredContent.ok).toBe(false)
	})
})

describe('set_job_basics', () => {
	it('recusa nível e área fora do vocabulário, nomeando o campo', () => {
		const { host, state } = makeHost()
		const result = tool(host, 'set_job_basics').run({ title: 'Dev', area: 'Foguetes', level: 'Ninja' })
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors.map((error) => error.field).sort()).toEqual(['area', 'level'])
		expect(state.draft.jobName).toBe('')
	})

	it('aceita rótulo pt, rótulo en e apelido; grava e avança para description', () => {
		const { host, state } = makeHost()
		const result = tool(host, 'set_job_basics').run({
			title: 'Engenheira de Dados',
			area: 'dados / bi',
			level: 'Mid-level',
			contract: 'pj',
			location: { city: 'São Paulo', state: 'SP', model: 'hybrid' },
			salary: 'R$ 10.000',
		})
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(state.draft).toMatchObject({
			jobName: 'Engenheira de Dados',
			jobCategories: 'Dados / BI',
			carrerLevel: 'Pleno',
			contractType: 'PJ',
			jobModel: 'Híbrido',
			city: 'São Paulo',
			state: 'SP',
			salary: 'R$ 10.000',
		})
		expect(result.step).toBe('description')
		expect(state.step).toBe('description')
		expect(result.missing).toEqual(['jobDescription', 'jobResponsabilities', 'jobRequirements'])
		expect(state.calls).toEqual([['set_job_basics', 'description']])
	})

	it('valida a área contra a lista da EMPRESA quando ela existe', () => {
		const { host } = makeHost(['Engenharia de Software', 'Produto'])
		const negado = tool(host, 'set_job_basics').run({ title: 'Dev', area: 'Dados / BI', level: 'Pleno' })
		expect(negado.ok).toBe(false)
		const aceito = tool(host, 'set_job_basics').run({ title: 'Dev', area: 'engenharia de software', level: 'Pleno' })
		expect(aceito.ok).toBe(true)
	})

	it('não volta o passo de quem já está adiante', () => {
		const { host, state } = makeHost()
		state.step = 'competencies'
		tool(host, 'set_job_basics').run({ title: 'Dev', area: 'Produto', level: 'Sênior' })
		expect(state.step).toBe('competencies')
	})
})

describe('set_job_description', () => {
	it('monta o Markdown nas seções da régua e grava nos três campos', () => {
		const { host, state } = makeHost()
		const result = tool(host, 'set_job_description').run({
			intro: 'Você vai cuidar do pipeline.',
			dayToDay: ['Modelar dados', '- Revisar PRs'],
			mustHave: ['SQL', 'Python'],
			niceToHave: ['dbt'],
			benefits: ['Plano de saúde'],
		})
		expect(result.ok).toBe(true)
		expect(state.draft.jobDescription).toBe(
			'Você vai cuidar do pipeline.\n\n## Como será o seu dia a dia\n\n- Modelar dados\n- Revisar PRs',
		)
		expect(state.draft.jobRequirements).toBe('## O que você precisa ter\n\n- SQL\n- Python\n\n## Diferenciais\n\n- dbt')
		expect(state.draft.jobResponsabilities).toBe('- Modelar dados\n- Revisar PRs')
		expect(state.draft.benefits).toBe('- Plano de saúde')
		expect(state.step).toBe('competencies')
	})

	it('usa cabeçalhos em inglês quando a vaga é em inglês', () => {
		const { host, state } = makeHost()
		state.draft.language = 'en'
		tool(host, 'set_job_description').run({ intro: 'Hi', dayToDay: ['Ship'], mustHave: ['Go'] })
		expect(state.draft.jobDescription).toContain('## What your day-to-day will look like')
		expect(state.draft.jobRequirements).toContain('## What you need to have')
	})

	it('recusa lista vazia ou item que não é texto', () => {
		const { host } = makeHost()
		const result = tool(host, 'set_job_description').run({ intro: 'x', dayToDay: [], mustHave: ['a', 3] })
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors.map((error) => error.field)).toEqual(['dayToDay', 'mustHave[1]'])
	})
})

describe('set_competencies', () => {
	it('grava uma por linha, com o "como observar", e avança para questions', () => {
		const { host, state } = makeHost()
		const result = tool(host, 'set_competencies').run({
			critical: [
				{ name: 'Modelagem', observe: 'explica trade-offs de esquema' },
				{ name: 'Comunicação', observe: 'traduz o técnico para o negócio' },
			],
			additional: [{ name: 'dbt', observe: 'já versionou modelos' }],
			expectations: 'Autonomia no pipeline.',
		})
		expect(result.ok).toBe(true)
		expect(state.draft.competencias_criticas).toBe(
			'Modelagem — explica trade-offs de esquema\nComunicação — traduz o técnico para o negócio',
		)
		expect(state.draft.competencias_adicionais).toBe('dbt — já versionou modelos')
		expect(state.draft.expectativas).toBe('Autonomia no pipeline.')
		expect(state.step).toBe('questions')
		if (result.ok) expect(result.pending).toEqual(['questions'])
	})
})

describe('set_interview_questions', () => {
	it('recusa tipo desconhecido e pergunta longa demais', () => {
		const { host } = makeHost()
		const result = tool(host, 'set_interview_questions').run({
			questions: [
				{ text: 'Conte uma vez…', competency: 'Comunicação', type: 'trick' },
				{ text: 'x'.repeat(MAX_QUESTION_CHARS + 1), competency: 'SQL', type: 'technical' },
			],
		})
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.errors.map((error) => error.field)).toEqual(['questions[0].type', 'questions[1].text'])
	})

	it('substitui o roteiro inteiro, guarda a competência e avança para review', () => {
		const { host, state } = makeHost()
		state.draft.jobQuestions = [{ question: 'antiga' }]
		const result = tool(host, 'set_interview_questions').run({
			questions: [{ text: 'Como você modelaria X?', competency: 'Modelagem', type: 'technical', level: 'Pleno' }],
		})
		expect(result.ok).toBe(true)
		expect(state.draft.jobQuestions).toEqual([{ question: 'Como você modelaria X?', competence: 'Modelagem' }])
		expect(state.step).toBe('review')
	})
})

describe('leitura', () => {
	it('get_job_form devolve passo, faltantes e o rascunho', () => {
		const { host, state } = makeHost()
		state.draft.jobName = 'Dev'
		const result = tool(host, 'get_job_form').run({})
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.step).toBe('basics')
		expect(result.missing).toContain('carrerLevel')
		expect(result.pending).toEqual(['competencies', 'questions'])
		expect((result.draft as { title: string }).title).toBe('Dev')
		expect(result.steps).toEqual(OPEN_STEPS)
	})

	it('get_writing_guide traz a régua e o vocabulário do formulário', () => {
		const { host } = makeHost()
		const result = tool(host, 'get_writing_guide').run({})
		expect(result.ok).toBe(true)
		if (!result.ok) return
		const vocabulary = result.vocabulary as { levels: string[]; areas: string[]; questionTypes: string[] }
		expect(vocabulary.levels).toContain('Pleno')
		expect(vocabulary.areas).toContain('Dados / BI')
		expect(vocabulary.questionTypes).toEqual(['technical', 'behavioral', 'situational', 'architectural'])
		expect(JSON.stringify(result.guide)).toContain('Como será o seu dia a dia')
	})
})
