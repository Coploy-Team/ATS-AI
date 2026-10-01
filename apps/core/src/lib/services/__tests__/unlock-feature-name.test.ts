import { createCompanyCreditsService } from '../company-credits'

/**
 * O consumo é gravado com um nome e lido com outro.
 *
 * O leitor sempre procurou `candidate_interview` (v1); o `UnlockCard` do ATS v2
 * grava `view_candidate`. O crédito debitava e o candidato seguia bloqueado —
 * pagou e não recebeu. Este teste existe para essa divergência não voltar em
 * silêncio: ela não quebra nada, só cobra sem entregar.
 */
function infraCom(docs: Array<Record<string, unknown>>) {
	return {
		billingRepository: { listCreditsUsed: jest.fn().mockResolvedValue(docs) },
	} as never
}

const par = [{ id: 'u1', jobApplied: 'ja1' }]

describe('desbloqueio honra as duas grafias', () => {
	it('reconhece o nome da v1', async () => {
		const { getPaidUserIdsForCandidates } = createCompanyCreditsService(
			infraCom([{ feature: 'candidate_interview', userId: 'u1', jobApplied: 'ja1' }]),
		)
		expect([...(await getPaidUserIdsForCandidates('c1', par))]).toHaveLength(1)
	})

	it('reconhece o nome que o ATS v2 gravou — senão o crédito pago se perde', async () => {
		const { getPaidUserIdsForCandidates } = createCompanyCreditsService(
			infraCom([{ feature: 'view_candidate', userId: 'u1', jobApplied: 'ja1' }]),
		)
		expect([...(await getPaidUserIdsForCandidates('c1', par))]).toHaveLength(1)
	})

	it('não confunde com outro consumo do mesmo candidato', async () => {
		const { getPaidUserIdsForCandidates } = createCompanyCreditsService(
			infraCom([{ feature: 'authenticity_analysis', userId: 'u1', jobApplied: 'ja1' }]),
		)
		expect([...(await getPaidUserIdsForCandidates('c1', par))]).toHaveLength(0)
	})

	it('não libera candidatura diferente do mesmo usuário', async () => {
		const { getPaidUserIdsForCandidates } = createCompanyCreditsService(
			infraCom([{ feature: 'view_candidate', userId: 'u1', jobApplied: 'OUTRA' }]),
		)
		expect([...(await getPaidUserIdsForCandidates('c1', par))]).toHaveLength(0)
	})
})
