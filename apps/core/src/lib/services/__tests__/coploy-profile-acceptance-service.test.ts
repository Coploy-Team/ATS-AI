const updateInterviewStatus = jest.fn().mockResolvedValue({})
const getKanbanConfig = jest.fn()
jest.mock('../interviews-service', () => ({ createInterviewsService: () => ({ updateInterviewStatus }) }))
jest.mock('../kanban-service', () => ({ createKanbanService: () => ({ getKanbanConfig }) }))

import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import {
	ACCEPTED_PROFILE_CODE,
	ACCEPTED_PROFILE_NOTE,
	createCoployProfileAcceptanceService,
	stageAfterInterview,
} from '../coploy-profile-acceptance-service'
import { createMockInfra } from './mock-infra'

const DEFAULT_STAGES = [
	{ id: 'applied' }, { id: 'pending' }, { id: 'selected' }, { id: 'approved' }, { id: 'hired' }, { id: 'rejected', offTrack: true },
]

function setup(overrides: { source?: string; stage?: string; accepts?: boolean | null } = {}) {
	const infra = createMockInfra()
	infra.candidateRepository.getJobInterview.mockResolvedValue({
		user_ref: { path: 'users/u1' }, job_applied_ref: { path: 'users/u1/jobsApplied/ja1' },
		candidateStatus: overrides.stage ?? 'Applied',
	} as never)
	infra.candidateRepository.getJobApplied.mockResolvedValue({ id: 'ja1', source: overrides.source ?? 'coploy_profile' } as never)
	infra.jobRepository.getJob.mockResolvedValue({ id: 'j1', acceptsCoployProfile: overrides.accepts } as never)
	infra.userRepository.getUsersCompany.mockResolvedValue({ display_name: 'Rita Recrutadora' } as never)
	getKanbanConfig.mockResolvedValue({ stages: DEFAULT_STAGES })
	updateInterviewStatus.mockClear()
	return { infra, service: createCoployProfileAcceptanceService(infra) }
}

describe('aceitar o perfil Coploy no lugar da entrevista (F5)', () => {
	it('a etapa seguinte à entrevista sai do quadro da vaga', () => {
		expect(stageAfterInterview(DEFAULT_STAGES)).toBe('selected')
		// quadro próprio: a coluna da empresa depois da entrevista
		expect(stageAfterInterview([{ id: 'applied' }, { id: 'pending' }, { id: 'triagem_1' }, { id: 'selected' }])).toBe('triagem_1')
		// sem coluna de entrevista: a primeira depois de Candidatura
		expect(stageAfterInterview([{ id: 'applied' }, { id: 'tecnica_2' }, { id: 'hired' }])).toBe('tecnica_2')
		// nunca cai em Reprovado, nem que venha logo depois
		expect(stageAfterInterview([{ id: 'applied' }, { id: 'pending' }, { id: 'rejected', offTrack: true }])).toBeNull()
	})

	it('aceita: move pelo caminho do quadro, com o motivo e quem aceitou no histórico', async () => {
		const { service } = setup()
		const result = await service.accept({ companyId: 'c1', jobId: 'j1', candidateId: 'cand1', actorId: 'rec1' })

		expect(result).toEqual({ candidateId: 'cand1', stage: 'selected' })
		expect(updateInterviewStatus).toHaveBeenCalledWith({
			interviewId: 'cand1', candidateStatus: 'selected', postJobId: 'j1', companyId: 'c1',
			rejectedByUserId: 'rec1', actorName: 'Rita Recrutadora',
			note: ACCEPTED_PROFILE_NOTE, noteCode: ACCEPTED_PROFILE_CODE,
		})
	})

	it('vaga sem a chave definida aceita (a chave nasce ligada); vaga que pede a entrevista recusa', async () => {
		await expect(setup({ accepts: null }).service.accept({ companyId: 'c1', jobId: 'j1', candidateId: 'cand1', actorId: 'rec1' })).resolves.toBeTruthy()
		await expect(setup({ accepts: false }).service.accept({ companyId: 'c1', jobId: 'j1', candidateId: 'cand1', actorId: 'rec1' })).rejects.toThrow(/pede a entrevista/)
		expect(updateInterviewStatus).not.toHaveBeenCalled()
	})

	it('só vale para quem compartilhou o perfil, e só antes de passar da entrevista', async () => {
		await expect(setup({ source: 'careers' }).service.accept({ companyId: 'c1', jobId: 'j1', candidateId: 'cand1', actorId: null })).rejects.toBeInstanceOf(BadRequestError)
		await expect(setup({ stage: 'Selected' }).service.accept({ companyId: 'c1', jobId: 'j1', candidateId: 'cand1', actorId: null })).rejects.toThrow(/já passou/)
		expect(updateInterviewStatus).not.toHaveBeenCalled()
	})

	it('candidato fora da vaga responde 404', async () => {
		const { infra, service } = setup()
		infra.candidateRepository.getJobInterview.mockResolvedValue(null as never)
		await expect(service.accept({ companyId: 'c1', jobId: 'j1', candidateId: 'x', actorId: null })).rejects.toBeInstanceOf(NotFoundError)
	})

	it('convidado que escolheu o perfil na sala (origem convite + marca) também pode ser aceito', async () => {
		const { infra, service } = setup({ source: 'invite', stage: 'Pending' })
		infra.candidateRepository.getJobApplied.mockResolvedValue({ id: 'ja1', source: 'invite', coployProfileSharedAt: new Date() } as never)
		await expect(service.accept({ companyId: 'c1', jobId: 'j1', candidateId: 'cand1', actorId: null })).resolves.toEqual({ candidateId: 'cand1', stage: 'selected' })
	})
})
