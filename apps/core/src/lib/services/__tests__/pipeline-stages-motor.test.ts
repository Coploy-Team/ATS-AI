import { PIPELINE_STAGES, defaultPipelineStages, jobRunsAiInterview } from '@coploy/domain'

/*
 * O Fato 2 do diagnóstico: "Entrevista IA" estava cravada na posição 1 de TODA
 * instalação. Quem nunca teria o plugin via no funil uma etapa que não ia
 * acontecer — e o candidato parava numa sessão vazia.
 */
describe('o funil sem Motor não mente', () => {
	it('com Motor, a régua é a de sempre', () => {
		expect(defaultPipelineStages({ motorDisponivel: true })).toEqual(PIPELINE_STAGES)
	})

	it('sem Motor, a etapa de entrevista sai', () => {
		const ids = defaultPipelineStages({ motorDisponivel: false }).map((s) => s.id)
		expect(ids).not.toContain('pending')
	})

	it('sem Motor sobram as 4 do ATS, mais os dois destinos', () => {
		const ids = defaultPipelineStages({ motorDisponivel: false }).map((s) => s.id)
		expect(ids).toEqual(['applied', 'selected', 'approved', 'hired', 'expired', 'rejected'])
	})

	/*
	 * O catálogo continua conhecendo `pending`: candidato gravado nessa etapa
	 * existe e precisa de rótulo mesmo onde a etapa não é mais oferecida. Tirar
	 * do catálogo faria o board mostrar o id cru.
	 */
	it('o catálogo continua conhecendo a etapa, mesmo fora do padrão', () => {
		expect(PIPELINE_STAGES.map((s) => s.id)).toContain('pending')
	})

	it('o funil sem Motor mantém entrada e terminal — o mínimo que o serviço exige', () => {
		const ids = defaultPipelineStages({ motorDisponivel: false }).map((s) => s.id)
		expect(ids.includes('applied') || ids.includes('pending')).toBe(true)
		expect(['approved', 'hired', 'rejected'].some((id) => ids.includes(id))).toBe(true)
	})
})

/*
 * A garantia do deploy: quem já existe não se move. A base legada tem
 * `aiInterview` nulo, e enquanto houver Motor ela continua com o funil que
 * sempre teve.
 */
describe('a base legada atravessa o deploy intacta', () => {
	it('vaga legada (aiInterview nulo) com Motor segue rodando entrevista', () => {
		expect(jobRunsAiInterview({}, { motorDisponivel: true })).toBe(true)
		expect(jobRunsAiInterview({ aiInterview: null }, { motorDisponivel: true })).toBe(true)
	})

	it('só quem DESLIGOU explicitamente perde a etapa', () => {
		expect(jobRunsAiInterview({ aiInterview: false }, { motorDisponivel: true })).toBe(false)
	})

	it('sem Motor ninguém roda entrevista, mesmo pedindo', () => {
		expect(jobRunsAiInterview({ aiInterview: true }, { motorDisponivel: false })).toBe(false)
	})
})
