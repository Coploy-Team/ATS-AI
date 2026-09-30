import { createCandidateInterviewsService } from '@/lib/services/candidate-interviews-service'

import { createMockInfra } from './mock-infra'

function servico(jobApplied: unknown) {
	const infra = createMockInfra()
	infra.candidateRepository.getJobApplied = jest.fn().mockResolvedValue(jobApplied)
	return { infra, service: createCandidateInterviewsService(infra as never) }
}

const COM_TUDO = {
	interview: {
		info: [
			{
				id: 'q1',
				question: 'Como você prioriza?',
				video: 'https://x/v1.webm',
				answer: 'Pergunto o que acontece se não for feito.',
				strengths: ['Tem critério explícito'],
				improvement: ['Não fala de comunicação'],
				/* o veredito vem no MESMO documento e não pode sair */
				score: 1.2,
				qRecomendation: 'Indicado para próxima etapa',
			},
		],
	},
}

describe('respostas de uma entrevista do candidato', () => {
	it('devolve vídeo, transcrição e os pontos da resposta', async () => {
		const { service } = servico(COM_TUDO)
		const [r] = await service.answersOf('u1', 'ja1')
		expect(r).toMatchObject({
			question: 'Como você prioriza?',
			videoUrl: 'https://x/v1.webm',
			answer: 'Pergunto o que acontece se não for feito.',
			strengths: ['Tem critério explícito'],
			improvement: ['Não fala de comunicação'],
		})
	})

	/*
	 * A régua da leva: o que a análise produz sobre a ADEQUAÇÃO à vaga é de quem
	 * contrata. Sai no mesmo documento, então o teste trava a saída — não a
	 * intenção de quem escreveu o mapeamento.
	 */
	it('não devolve nota nem recomendação de contratação', async () => {
		const { service } = servico(COM_TUDO)
		const [r] = await service.answersOf('u1', 'ja1')
		expect(r).not.toHaveProperty('score')
		expect(r).not.toHaveProperty('qRecomendation')
		expect(JSON.stringify(r)).not.toContain('Indicado para próxima etapa')
	})

	it('pergunta sem vídeo não vira card', async () => {
		const { service } = servico({ interview: { info: [{ question: 'sem gravação' }] } })
		expect(await service.answersOf('u1', 'ja1')).toEqual([])
	})

	/* Pulada tem vídeo mas nada a mostrar — some, em vez de virar card mudo. */
	it('pergunta pulada fica de fora', async () => {
		const { service } = servico({
			interview: { info: [{ question: 'x', video: 'https://x/v.webm', pulou_a_pergunta: true }] },
		})
		expect(await service.answersOf('u1', 'ja1')).toEqual([])
	})

	/*
	 * O recorte por dono não é uma verificação a mais que alguém possa esquecer:
	 * `getJobApplied` é escopado pelo userId, então pedir a entrevista de outra
	 * pessoa não encontra nada.
	 */
	it('entrevista que não é sua não existe', async () => {
		const { infra, service } = servico(null)
		expect(await service.answersOf('outro', 'ja-alheia')).toEqual([])
		expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith('outro', 'ja-alheia')
	})

	it('leitura instável devolve vazio, não derruba a tela', async () => {
		const infra = createMockInfra()
		infra.candidateRepository.getJobApplied = jest.fn().mockRejectedValue(new Error('firestore'))
		const service = createCandidateInterviewsService(infra as never)
		expect(await service.answersOf('u1', 'ja1')).toEqual([])
	})
})
