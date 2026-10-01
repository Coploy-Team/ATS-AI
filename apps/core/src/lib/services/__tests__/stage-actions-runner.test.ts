import { createStageActionsRunner } from '../stage-actions-runner'

const inviteToInterview = jest.fn()
const requestProfile = jest.fn()

jest.mock('../interview-invite-service', () => ({
	createInterviewInviteService: () => ({ inviteToInterview: (...args: unknown[]) => inviteToInterview(...args) }),
}))
jest.mock('../profile-request-service', () => ({
	createProfileRequestService: () => ({ requestProfile: (...args: unknown[]) => requestProfile(...args) }),
}))
jest.mock('../candidate-timeline-service', () => ({
	createCandidateTimelineService: () => ({ recordEvent: jest.fn().mockResolvedValue(undefined) }),
}))

function infraWith(stageActions: Record<string, string[]> | null) {
	return {
		companyRepository: { getCompany: jest.fn().mockResolvedValue({ id: 'c1', stageActions }) },
	} as never
}

describe('disparo das ações da etapa', () => {
	beforeEach(() => {
		inviteToInterview.mockReset().mockResolvedValue(undefined)
		requestProfile.mockReset().mockResolvedValue(undefined)
	})

	it('dispara o convite para quem entrou na etapa configurada', async () => {
		await createStageActionsRunner(infraWith({ selected: ['invite_interview'] })).run({
			companyId: 'c1',
			jobId: 'j1',
			stageId: 'selected',
			candidateIds: ['cand1', 'cand2'],
		})
		expect(inviteToInterview).toHaveBeenCalledWith(
			expect.objectContaining({ companyId: 'c1', jobId: 'j1', candidateIds: ['cand1', 'cand2'] }),
		)
	})

	it('não dispara nada quando ninguém entrou', async () => {
		await createStageActionsRunner(infraWith({ selected: ['invite_interview'] })).run({
			companyId: 'c1',
			jobId: 'j1',
			stageId: 'selected',
			candidateIds: [],
		})
		expect(inviteToInterview).not.toHaveBeenCalled()
	})

	it('etapa sem ação configurada não chama nada', async () => {
		await createStageActionsRunner(infraWith({ approved: ['invite_interview'] })).run({
			companyId: 'c1',
			jobId: 'j1',
			stageId: 'selected',
			candidateIds: ['cand1'],
		})
		expect(inviteToInterview).not.toHaveBeenCalled()
	})

	it('reprovado nunca dispara — tem caminho próprio de e-mail', async () => {
		await createStageActionsRunner(infraWith({ rejected: ['invite_interview'] })).run({
			companyId: 'c1',
			jobId: 'j1',
			stageId: 'rejected',
			candidateIds: ['cand1'],
		})
		expect(inviteToInterview).not.toHaveBeenCalled()
	})

	it('falha do e-mail não derruba a movimentação', async () => {
		inviteToInterview.mockRejectedValue(new Error('SMTP fora do ar'))
		const outcomes = await createStageActionsRunner(
			infraWith({ selected: ['invite_interview'] }),
		).run({ companyId: 'c1', jobId: 'j1', stageId: 'selected', candidateIds: ['cand1'] })

		expect(outcomes).toEqual([
			expect.objectContaining({ action: 'invite_interview', ok: false }),
		])
	})

	it('candidato que falha no pedido de currículo não cala os outros', async () => {
		requestProfile
			.mockRejectedValueOnce(new Error('sem e-mail'))
			.mockResolvedValueOnce(undefined)
		await createStageActionsRunner(infraWith({ selected: ['request_resume'] })).run({
			companyId: 'c1',
			jobId: 'j1',
			stageId: 'selected',
			candidateIds: ['cand1', 'cand2'],
		})
		expect(requestProfile).toHaveBeenCalledTimes(2)
	})
})
