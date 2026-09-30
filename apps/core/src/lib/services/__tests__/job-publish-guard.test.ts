import { resolveJobStatus, jobStateFlagsFor, jobRunsAiInterview } from '@coploy/domain'
import {
	findPublishBlockers,
	isLeavingDraft,
} from '@/lib/services/job-publish-guard'

const vagaPronta = {
	jobName: 'Pessoa Desenvolvedora',
	jobDescription: 'Trabalhar com Node e React.',
	jobCategories: 'Tecnologia da Informação',
	carrerLevel: 'Pleno',
	typeInterview: 'interview',
	jobQuestions: [{ id: '1', question: 'Fale de você' }],
}

describe('estado da vaga', () => {
	/**
	 * O invariante da leva: a base de produção não tem o campo gravado e não
	 * pode mudar de lugar no deploy.
	 */
	it('vaga legada sem status continua onde estava', () => {
		expect(resolveJobStatus({ stopped: false, archived: false })).toBe('open')
		expect(resolveJobStatus({ stopped: true, archived: false })).toBe('paused')
		expect(resolveJobStatus({ archived: true })).toBe('closed')
		expect(resolveJobStatus({})).toBe('open')
	})

	it('vaga interna (fora do portal) é aberta, não rascunho', () => {
		// `public` responde "está no portal?", não "está no ar?"
		expect(resolveJobStatus({ stopped: false, archived: false })).toBe('open')
	})

	it('valor gravado vence a derivação', () => {
		expect(resolveJobStatus({ status: 'draft', stopped: true })).toBe('draft')
	})

	it('valor desconhecido cai na derivação em vez de vazar', () => {
		expect(resolveJobStatus({ status: 'sei-la', stopped: true })).toBe('paused')
	})

	/**
	 * A propriedade que faz o rascunho ser seguro: quem não conhece o campo
	 * novo — portal, orchestrator, hunting — já o exclui pelos booleanos.
	 */
	it('rascunho nasce invisível para quem não conhece o campo', () => {
		expect(jobStateFlagsFor('draft')).toEqual({
			stopped: true,
			archived: false,
			public: false,
		})
	})
})

describe('o que impede publicar', () => {
	it('vaga pronta não tem impedimento', () => {
		expect(findPublishBlockers(vagaPronta)).toEqual([])
	})

	/** O defeito que originou a leva. */
	it('vaga de entrevista sem pergunta não publica', () => {
		const blockers = findPublishBlockers({ ...vagaPronta, jobQuestions: [] })
		expect(blockers.map((b) => b.field)).toEqual(['jobQuestions'])
	})

	it('pergunta adicional também conta', () => {
		const blockers = findPublishBlockers({
			...vagaPronta,
			jobQuestions: [],
			additionalQuestions: [{ id: '1', question: 'E aí?' }],
		})
		expect(blockers).toEqual([])
	})

	it('triagem não conduz entrevista, então não se cobra pergunta dela', () => {
		const blockers = findPublishBlockers({
			...vagaPronta,
			typeInterview: 'evaluation',
			jobQuestions: [],
		})
		expect(blockers).toEqual([])
	})

	it('lista tudo que falta de uma vez, não um por rodada', () => {
		const blockers = findPublishBlockers({ jobName: 'Dev' })
		expect(blockers.map((b) => b.field).sort()).toEqual([
			'carrerLevel',
			'jobCategories',
			'jobDescription',
		])
	})

	it('descrição gerada pelo Motor conta como descrição', () => {
		const blockers = findPublishBlockers({
			...vagaPronta,
			jobDescription: '',
			generatedJobDescription: 'Texto gerado.',
		})
		expect(blockers).toEqual([])
	})

	it('espaço em branco não é conteúdo', () => {
		const blockers = findPublishBlockers({ ...vagaPronta, jobDescription: '   ' })
		expect(blockers.map((b) => b.field)).toEqual(['jobDescription'])
	})
})

describe('quando a guarda dispara', () => {
	const rascunho = { status: 'draft' as const, stopped: true, archived: false }
	const noAr = { status: 'open' as const, stopped: false, archived: false }

	it('dispara ao sair do rascunho', () => {
		expect(isLeavingDraft(rascunho, { status: 'open' })).toBe(true)
		expect(isLeavingDraft(rascunho, { public: true })).toBe(true)
		expect(isLeavingDraft(rascunho, { stopped: false })).toBe(true)
	})

	it('editar o próprio rascunho não dispara', () => {
		expect(isLeavingDraft(rascunho, { jobName: 'outro' } as never)).toBe(false)
	})

	/**
	 * A trava que protege a base legada: vaga que já está no ar continua
	 * editável mesmo incompleta — ela já foi publicada, e travar puniria quem
	 * está tentando melhorá-la.
	 */
	it('vaga legada incompleta que já está no ar segue editável', () => {
		expect(isLeavingDraft(noAr, { public: true })).toBe(false)
		expect(isLeavingDraft({ stopped: false }, { public: true })).toBe(false)
	})

	it('republicar vaga pausada não passa pela guarda', () => {
		expect(isLeavingDraft({ stopped: true }, { stopped: false })).toBe(false)
	})
})

describe('o Motor é aquisição, não regra', () => {
	const SEM_MOTOR = { motorDisponivel: false }
	const COM_MOTOR = { motorDisponivel: true }

	/**
	 * O defeito que esta leva corrige.
	 *
	 * A instalação aberta não tem passo de perguntas no formulário — a vaga era
	 * recusada por algo que a pessoa não tinha como resolver na tela dela.
	 */
	it('sem Motor não se cobra pergunta: não há entrevista para conduzir', () => {
		const blockers = findPublishBlockers(
			{ ...vagaPronta, jobQuestions: [] },
			SEM_MOTOR,
		)
		expect(blockers).toEqual([])
	})

	it('com Motor a cobrança continua valendo', () => {
		const blockers = findPublishBlockers(
			{ ...vagaPronta, jobQuestions: [] },
			COM_MOTOR,
		)
		expect(blockers.map((b) => b.field)).toEqual(['jobQuestions'])
	})

	/** A segunda porta: vaga sem entrevista numa instalação que TEM o Motor. */
	it('vaga que declara não usar o Motor não precisa de pergunta', () => {
		const blockers = findPublishBlockers(
			{ ...vagaPronta, jobQuestions: [], aiInterview: false },
			COM_MOTOR,
		)
		expect(blockers).toEqual([])
	})

	it('o resto da cobrança não depende do Motor', () => {
		// descrição e área o candidato lê nos dois casos
		const blockers = findPublishBlockers({ jobName: 'Dev' }, SEM_MOTOR)
		expect(blockers.map((b) => b.field).sort()).toEqual([
			'carrerLevel',
			'jobCategories',
			'jobDescription',
		])
	})

	describe('quem conduz entrevista', () => {
		it('sem Motor, ninguém — nem a vaga que pede', () => {
			expect(jobRunsAiInterview({ aiInterview: true }, SEM_MOTOR)).toBe(false)
		})

		/** Toda vaga da base foi criada supondo entrevista; dizer não apagaria o uso. */
		it('vaga legada com Motor continua entrevistando', () => {
			expect(jobRunsAiInterview({}, COM_MOTOR)).toBe(true)
		})

		it('só a recusa explícita desliga', () => {
			expect(jobRunsAiInterview({ aiInterview: false }, COM_MOTOR)).toBe(false)
		})
	})
})
