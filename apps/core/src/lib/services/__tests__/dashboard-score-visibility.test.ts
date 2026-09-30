import { createDashboardScoreVisibility } from '../dashboard-score-visibility'

const getPaid = jest.fn()
jest.mock('../company-credits', () => ({
	createCompanyCreditsService: () => ({
		getPaidUserIdsForCandidates: (...args: unknown[]) => getPaid(...args),
	}),
}))

function infraCom(plano: string) {
	return {
		companyRepository: { getCompany: jest.fn().mockResolvedValue({ subscriptionPlan: plano }) },
	} as never
}

const entrevistas = [
	{ user_ref: { path: 'users/u1' }, job_applied_ref: { path: 'x/ja1' }, score: 8 },
	{ user_ref: { path: 'users/u2' }, job_applied_ref: { path: 'x/ja2' }, score: 3 },
]

describe('nota no painel só depois de liberada', () => {
	beforeEach(() => getPaid.mockReset().mockResolvedValue(new Set()))

	it('candidato bloqueado não entra na média — a agregação seria o mesmo dado', async () => {
		const visiveis = await createDashboardScoreVisibility(infraCom('free')).filterVisibleScores(
			'c1',
			entrevistas,
		)
		expect(visiveis).toEqual([])
	})

	it('entra só quem foi pago', async () => {
		getPaid.mockResolvedValue(new Set([{ id: 'u2', jobApplied: 'ja2' }]))
		const visiveis = await createDashboardScoreVisibility(infraCom('free')).filterVisibleScores(
			'c1',
			entrevistas,
		)
		expect(visiveis.map((e) => e.score)).toEqual([3])
	})

	it('enterprise vê tudo — contrato fechado, sem bloqueio por candidato', async () => {
		const visiveis = await createDashboardScoreVisibility(
			infraCom('enterprise'),
		).filterVisibleScores('c1', entrevistas)
		expect(visiveis).toHaveLength(2)
		expect(getPaid).not.toHaveBeenCalled()
	})

	it('falha ao ler quem pagou esconde tudo — vazar é irreversível, painel vazio não', async () => {
		getPaid.mockRejectedValue(new Error('firestore fora'))
		const visiveis = await createDashboardScoreVisibility(infraCom('free')).filterVisibleScores(
			'c1',
			entrevistas,
		)
		expect(visiveis).toEqual([])
	})
})
