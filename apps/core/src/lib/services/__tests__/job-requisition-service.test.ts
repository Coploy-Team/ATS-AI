import { createJobRequisitionService } from '../job-requisition-service'

function makeInfra(requisition: Record<string, unknown> | null = null, company: unknown = {}) {
	return {
		jobRequisitionRepository: {
			listRequisitions: jest.fn().mockResolvedValue([]),
			getRequisition: jest.fn().mockResolvedValue(requisition),
			createRequisition: jest.fn().mockImplementation((_c, data) => ({ id: 'r1', ...data })),
			updateRequisition: jest.fn().mockResolvedValue(undefined),
		},
		companyRepository: { getCompany: jest.fn().mockResolvedValue(company) },
	} as never
}

const base = { companyId: 'c1', requestedByUserId: 'u1' }

describe('requisição de vaga', () => {
	it('recusa faixa salarial invertida', async () => {
		const service = createJobRequisitionService(makeInfra())
		await expect(
			service.createRequisition({
				...base,
				title: 'Dev',
				salaryRangeMin: 9000,
				salaryRangeMax: 5000,
			}),
		).rejects.toThrow(/invertida/)
	})

	it('recusar EXIGE justificativa — quem pediu precisa saber o que mudar', async () => {
		const service = createJobRequisitionService(
			makeInfra({ id: 'r1', status: 'pending' }),
		)
		await expect(
			service.decide({
				companyId: 'c1',
				requisitionId: 'r1',
				decision: 'rejected',
				decidedByUserId: 'u2',
			}),
		).rejects.toThrow(/motivo/)
	})

	it('não decide duas vezes a mesma requisição', async () => {
		const service = createJobRequisitionService(
			makeInfra({ id: 'r1', status: 'approved' }),
		)
		await expect(
			service.decide({
				companyId: 'c1',
				requisitionId: 'r1',
				decision: 'rejected',
				decidedByUserId: 'u2',
				note: 'mudou o plano',
			}),
		).rejects.toThrow(/já foi decidida/)
	})

	it('uma requisição gera UMA vaga', async () => {
		const service = createJobRequisitionService(
			makeInfra({ id: 'r1', status: 'approved', jobId: 'job-ja-criada' }),
		)
		await expect(
			service.linkJob({ companyId: 'c1', requisitionId: 'r1', jobId: 'outra' }),
		).rejects.toThrow(/já gerou/)
	})

	it('exigir requisição é opt-in — empresa sem a flag segue criando vaga direto', async () => {
		const semFlag = createJobRequisitionService(makeInfra(null, { featureFlags: {} }))
		await expect(semFlag.requiresRequisition('c1')).resolves.toBe(false)

		const comFlag = createJobRequisitionService(
			makeInfra(null, { featureFlags: { jobRequisition: true } }),
		)
		await expect(comFlag.requiresRequisition('c1')).resolves.toBe(true)
	})
})

/**
 * O elo que estava solto.
 *
 * `linkJob` existia e NINGUÉM o chamava: aprovar uma requisição não autorizava
 * nada, e a mesma requisição podia virar vaga quantas vezes quisessem. Agora a
 * criação de vaga consome a requisição — e estes testes travam as duas metades
 * da regra, porque um `assertUsable` frouxo devolve exatamente o bug antigo.
 */
describe('requisição vira vaga', () => {
	it('aprovada e sem vaga pode ser usada', async () => {
		const service = createJobRequisitionService(
			makeInfra({ id: 'r1', status: 'approved', jobId: null }),
		)
		await expect(
			service.assertUsable({ companyId: 'c1', requisitionId: 'r1' }),
		).resolves.toMatchObject({ id: 'r1' })
	})

	it('não aprovada não vira vaga', async () => {
		const service = createJobRequisitionService(
			makeInfra({ id: 'r1', status: 'pending', jobId: null }),
		)
		await expect(
			service.assertUsable({ companyId: 'c1', requisitionId: 'r1' }),
		).rejects.toThrow(/aprovada/)
	})

	it('a que já gerou vaga não gera outra', async () => {
		const service = createJobRequisitionService(
			makeInfra({ id: 'r1', status: 'approved', jobId: 'job-1' }),
		)
		await expect(
			service.assertUsable({ companyId: 'c1', requisitionId: 'r1' }),
		).rejects.toThrow(/já gerou/)
	})

	it('inexistente falha em vez de criar vaga solta', async () => {
		const service = createJobRequisitionService(makeInfra(null))
		await expect(
			service.assertUsable({ companyId: 'c1', requisitionId: 'sumiu' }),
		).rejects.toThrow(/não encontrada/)
	})

	/*
	 * O guard tem de sobreviver à desestruturação: `const { linkJob } = service`
	 * é escrita comum, e com `this` a validação sumiria em silêncio.
	 */
	it('o guard sobrevive a `const { linkJob } = service`', async () => {
		const infra = makeInfra({ id: 'r1', status: 'pending', jobId: null })
		const { linkJob } = createJobRequisitionService(infra)
		await expect(
			linkJob({ companyId: 'c1', requisitionId: 'r1', jobId: 'job-1' }),
		).rejects.toThrow(/aprovada/)
	})

	it('marca a requisição com o id da vaga criada', async () => {
		const infra = makeInfra({ id: 'r1', status: 'approved', jobId: null }) as unknown as {
			jobRequisitionRepository: { updateRequisition: jest.Mock }
		}
		const service = createJobRequisitionService(infra as never)
		await service.linkJob({ companyId: 'c1', requisitionId: 'r1', jobId: 'job-1' })
		expect(infra.jobRequisitionRepository.updateRequisition).toHaveBeenCalledWith(
			'c1',
			'r1',
			{ jobId: 'job-1' },
		)
	})
})
