import { createCandidateInsightsService } from '../candidate-insights-service'
import { createMockInfra } from './mock-infra'

function interview(
	overrides: {
		finished?: boolean
		date?: string
		estruturacao?: number
		exemplificacao?: number
		profundidade?: number
		strengths?: string[]
		development?: string[]
		suggestions?: string[]
	} = {},
) {
	return {
		id: `i-${Math.round((overrides.estruturacao ?? 0) * 1000)}-${overrides.date ?? ''}`,
		finished: overrides.finished ?? true,
		finishedTime: overrides.date ?? '2026-01-01',
		score: 8.7,
		interview: {
			estruturacao: overrides.estruturacao,
			exemplificacao: overrides.exemplificacao,
			profundidade: overrides.profundidade,
			// requisito não atendido da vaga — nunca pode virar "sugestão"
			generalImprovement: ['Experiência comprovada com Spring e Hibernate'],
		},
		avaliacaoFinal: {
			recomendacoes: { sugestoes_melhoria: overrides.suggestions ?? [] },
			competencias_criticas: [
				...(overrides.strengths ?? []).map((nome) => ({ nome, pontos_fortes: ['ok'] })),
				...(overrides.development ?? []).map((nome) => ({
					nome,
					pontos_desenvolvimento: ['faltou exemplo'],
				})),
			],
		},
	}
}

function serviceWith(interviews: unknown[]) {
	const infra = createMockInfra()
	infra.candidateRepository.listJobsApplied.mockResolvedValue(interviews)
	return createCandidateInsightsService(infra)
}

describe('candidate-insights-service', () => {
	it('NUNCA devolve veredito — nota, aprovação ou aderência à vaga', async () => {
		const service = serviceWith([interview({ estruturacao: 9, strengths: ['Comunicação'] })])

		const insights = await service.getInsights('u1')

		// o dado existe no jobApplied (score: 8.7) e não pode vazar por campo nenhum
		expect(JSON.stringify(insights)).not.toMatch(/8\.7|score|pontuacao|aprovad/i)
		expect(Object.keys(insights)).not.toContain('score')
	})

	it('compara a pessoa com ela mesma: aponta a dimensão mais forte e a com mais espaço', async () => {
		const service = serviceWith([
			interview({ estruturacao: 5, exemplificacao: 9, profundidade: 7 }),
		])

		const insights = await service.getInsights('u1')

		expect(insights.strongestDimension).toBe('examples')
		expect(insights.dimensionToImprove).toBe('structure')
	})

	it('normaliza dimensões salvas em 0–1 (docs antigos) junto com as de 0–10', async () => {
		const service = serviceWith([
			interview({ estruturacao: 0.9, exemplificacao: 4, profundidade: 0.2 }),
		])

		const insights = await service.getInsights('u1')

		// 0.9 vira 9 e passa na frente do 4; 0.2 vira 2 e fica por último
		expect(insights.strongestDimension).toBe('structure')
		expect(insights.dimensionToImprove).toBe('depth')
	})

	it('só conta como padrão o que se repete em duas entrevistas', async () => {
		const service = serviceWith([
			interview({ date: '2026-01-01', strengths: ['Comunicação', 'Autonomia'] }),
			interview({ date: '2026-02-01', strengths: ['Comunicação'] }),
		])

		const insights = await service.getInsights('u1')

		expect(insights.recurringStrengths).toEqual(['Comunicação'])
	})

	it('com uma entrevista só, mostra o que apareceu — melhor que tela vazia', async () => {
		const service = serviceWith([interview({ strengths: ['Liderança'] })])

		expect((await service.getInsights('u1')).recurringStrengths).toEqual(['Liderança'])
	})

	it('marca melhora quando as entrevistas recentes superam as antigas', async () => {
		const service = serviceWith([
			interview({ date: '2026-01-01', estruturacao: 5 }),
			interview({ date: '2026-02-01', estruturacao: 5 }),
			interview({ date: '2026-03-01', estruturacao: 8 }),
			interview({ date: '2026-04-01', estruturacao: 8 }),
		])

		expect((await service.getInsights('u1')).improvingDimensions).toContain('structure')
	})

	it('não existe "piorando": queda não vira narrativa', async () => {
		const service = serviceWith([
			interview({ date: '2026-01-01', estruturacao: 9 }),
			interview({ date: '2026-02-01', estruturacao: 9 }),
			interview({ date: '2026-03-01', estruturacao: 4 }),
			interview({ date: '2026-04-01', estruturacao: 4 }),
		])

		expect((await service.getInsights('u1')).improvingDimensions).toEqual([])
	})

	it('ignora entrevista não concluída: sem avaliação, não diz nada sobre a pessoa', async () => {
		const service = serviceWith([
			interview({ finished: false, estruturacao: 1, strengths: ['Não deveria contar'] }),
		])

		const insights = await service.getInsights('u1')

		expect(insights.interviewsAnalyzed).toBe(0)
		expect(insights.strongestDimension).toBeNull()
		expect(insights.recurringStrengths).toEqual([])
	})

	it('não usa `generalImprovement` como sugestão: ali mora requisito da vaga', async () => {
		const service = serviceWith([interview({ suggestions: ['Traga exemplos concretos'] })])

		const insights = await service.getInsights('u1')

		// dizer "experiência comprovada com Spring" ao candidato entrega o
		// veredito da vaga disfarçado de conselho
		expect(insights.suggestions).not.toContain('Experiência comprovada com Spring e Hibernate')
		expect(insights.suggestions).toEqual(['Traga exemplos concretos'])
	})

	it('agrupa sugestões repetidas em vez de listar a mesma ideia várias vezes', async () => {
		const service = serviceWith([
			interview({ date: '2026-01-01', suggestions: ['Traga exemplos concretos'] }),
			interview({ date: '2026-02-01', suggestions: ['traga exemplos concretos'] }),
		])

		expect((await service.getInsights('u1')).suggestions).toEqual(['Traga exemplos concretos'])
	})
})
