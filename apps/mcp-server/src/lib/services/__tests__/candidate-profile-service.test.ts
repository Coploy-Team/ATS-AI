jest.mock('@/env', () => ({
	env: {
		FIREBASE_API_KEY: undefined,
		INTERVIEW_BASE_URL: 'https://interview.coploy.io',
		CORE_BASE_URL: 'http://core.test',
	},
}))

jest.mock('@/lib/core-client', () => ({
	getCandidateProfile: jest.fn(),
	createCandidateProfile: jest.fn(),
	updateCandidateProfile: jest.fn(),
	getProfileInterviewStatus: jest.fn(),
	provisionProfileInterview: jest.fn(),
	issueInterviewHandoff: jest.fn(),
}))

import * as coreClient from '@/lib/core-client'
import { createCandidateProfileService } from '../candidate-profile-service'
import { createMockInfra } from './mock-infra'

const mocked = coreClient as jest.Mocked<typeof coreClient>

const NO_INTERVIEW = {
	ok: true as const,
	data: {
		hasInterview: false,
		jobId: null,
		companyId: null,
		status: 'not_started' as const,
		interviewUrl: null,
		createdAt: null,
		completedAt: null,
	},
}

describe('candidate-profile-service', () => {
	describe('getOverview', () => {
		it('aponta complete_profile quando faltam campos que pesam no match', async () => {
			const infra = createMockInfra()
			// completude e o que falta vêm calculados do core (porta única)
			mocked.getCandidateProfile.mockResolvedValue({
				ok: true,
				data: { id: 'u1', name: 'Ana', email: 'a@b.c', missingFields: ['occupation', 'level', 'summary'], completeness: 8 },
			})
			mocked.getProfileInterviewStatus.mockResolvedValue(NO_INTERVIEW)
			const service = createCandidateProfileService(infra)

			const overview = await service.getOverview('u1')

			// falta o essencial (occupation/level) → ainda não dá pra gerar entrevista
			expect(overview.nextStep).toBe('complete_profile')
			expect(overview.missingFields).toEqual(['occupation', 'level', 'summary'])
			expect(overview.completeness).toBe(8)
		})

		it('aponta start_profile_interview quando o perfil está completo e não há entrevista', async () => {
			const infra = createMockInfra()
			mocked.getCandidateProfile.mockResolvedValue({
				ok: true,
				data: { id: 'u1', name: 'Ana', email: 'a@b.c', occupation: 'Dev', level: 'Pleno', missingFields: ['certifications'] },
			})
			mocked.getProfileInterviewStatus.mockResolvedValue(NO_INTERVIEW)
			const service = createCandidateProfileService(infra)

			// só falta enriquecimento opcional — o essencial está lá
			expect((await service.getOverview('u1')).nextStep).toBe('start_profile_interview')
		})

		it('entrega link JÁ AUTENTICADO quando há entrevista pendente (o assistente passa este link)', async () => {
			const infra = createMockInfra()
			mocked.getCandidateProfile.mockResolvedValue({
				ok: true,
				data: { id: 'u1', name: 'Ana', email: 'a@b.c', profession: 'Dev', location: 'SP', summary: 'x', skills: ['Node'] },
			})
			mocked.getProfileInterviewStatus.mockResolvedValue({
				ok: true,
				data: {
					...NO_INTERVIEW.data,
					hasInterview: true,
					status: 'pending',
					jobId: 'j1',
					interviewUrl: 'https://interview.coploy.io/job/j1/company/c1/login',
				},
			})
			mocked.issueInterviewHandoff.mockResolvedValue({ ok: true, data: { code: 'TICKET1', expiresAt: 'x' } })
			const service = createCandidateProfileService(infra)

			const overview = await service.getOverview('u1')

			expect(overview.interview.interviewUrl).toBe(
				'https://interview.coploy.io/job/j1/company/c1/login?handoff=TICKET1',
			)
		})

		it('não gasta ticket quando a entrevista já foi concluída', async () => {
			const infra = createMockInfra()
			mocked.getCandidateProfile.mockResolvedValue({
				ok: true,
				data: { id: 'u1', name: 'Ana', email: 'a@b.c', profession: 'Dev', location: 'SP', summary: 'x', skills: ['Node'] },
			})
			mocked.getProfileInterviewStatus.mockResolvedValue({
				ok: true,
				data: {
					...NO_INTERVIEW.data,
					hasInterview: true,
					status: 'completed',
					jobId: 'j1',
					interviewUrl: 'https://interview.coploy.io/job/j1/company/c1/login',
				},
			})
			const service = createCandidateProfileService(infra)

			await service.getOverview('u1')

			expect(mocked.issueInterviewHandoff).not.toHaveBeenCalled()
		})

		it('aponta finish_profile_interview quando a entrevista existe mas não terminou', async () => {
			const infra = createMockInfra()
			mocked.getCandidateProfile.mockResolvedValue({
				ok: true,
				data: { id: 'u1', name: 'Ana', email: 'a@b.c', profession: 'Dev', location: 'SP', summary: 'x', skills: ['Node'] },
			})
			mocked.getProfileInterviewStatus.mockResolvedValue({
				ok: true,
				data: { ...NO_INTERVIEW.data, hasInterview: true, status: 'in_progress', jobId: 'j1', interviewUrl: 'https://i/1' },
			})
			mocked.issueInterviewHandoff.mockResolvedValue({ ok: false, status: 500, message: 'x' })
			const service = createCandidateProfileService(infra)

			expect((await service.getOverview('u1')).nextStep).toBe('finish_profile_interview')
		})

		it('degrada sem quebrar quando o core não responde o status da entrevista', async () => {
			const infra = createMockInfra()
			mocked.getCandidateProfile.mockResolvedValue({ ok: false, status: 500, message: 'core down' })
			mocked.getProfileInterviewStatus.mockResolvedValue({ ok: false, status: 500, message: 'core down' })
			const service = createCandidateProfileService(infra)

			const overview = await service.getOverview('u1')

			expect(overview.profile).toBeNull()
			expect(overview.interview.status).toBe('not_started')
			expect(overview.completeness).toBe(0)
		})
	})

	describe('saveProfile', () => {
		it('grava via porta única e devolve a completude atualizada', async () => {
			const infra = createMockInfra()
			mocked.updateCandidateProfile.mockResolvedValue({
				ok: true,
				data: { id: 'u1', completeness: 42, missingFields: ['summary'] },
			})
			const service = createCandidateProfileService(infra)

			// o core cria o perfil na primeira escrita — o canal não precisa saber
			expect(await service.saveProfile('u1', { location: 'SP' })).toEqual({
				ok: true,
				message: 'Profile updated.',
				completeness: 42,
				missingFields: ['summary'],
			})
		})

		it('propaga erro real do core sem tentar criar (não mascara 500)', async () => {
			const infra = createMockInfra()
			mocked.updateCandidateProfile.mockResolvedValue({ ok: false, status: 500, message: 'boom' })
			const service = createCandidateProfileService(infra)

			expect(await service.saveProfile('u1', { location: 'SP' })).toEqual({ ok: false, message: 'boom' })
			expect(mocked.createCandidateProfile).not.toHaveBeenCalled()
		})
	})

	describe('startProfileInterview', () => {
		it('delega ao core e devolve o link da entrevista de perfil', async () => {
			const infra = createMockInfra()
			mocked.provisionProfileInterview.mockResolvedValue({
				ok: true,
				data: {
					hasInterview: true,
					created: true,
					jobId: 'j1',
					companyId: 'c1',
					status: 'pending',
					interviewUrl: 'https://interview.coploy.io/job/j1/company/c1/login',
					createdAt: '2026-08-10T00:00:00.000Z',
					completedAt: null,
					jobName: 'Dev - Pleno',
					questionCount: 5,
				},
			})
			const service = createCandidateProfileService(infra)

			mocked.issueInterviewHandoff.mockResolvedValue({ ok: true, data: { code: 'CODE123', expiresAt: 'x' } })

			const result = await service.startProfileInterview('u1', { occupation: 'Dev', level: 'Pleno' })

			expect(result).toMatchObject({ ok: true })
			// link já autenticado: leva o ticket de uso único
			expect(result.ok && result.data.interviewUrl).toBe(
				'https://interview.coploy.io/job/j1/company/c1/login?handoff=CODE123',
			)
		})

		it('degrada pro link sem handoff quando a emissão do ticket falha', async () => {
			const infra = createMockInfra()
			mocked.provisionProfileInterview.mockResolvedValue({
				ok: true,
				data: {
					hasInterview: true,
					created: true,
					jobId: 'j1',
					companyId: 'c1',
					status: 'pending',
					interviewUrl: 'https://interview.coploy.io/job/j1/company/c1/login',
					createdAt: null,
					completedAt: null,
					jobName: 'Dev - Pleno',
					questionCount: 5,
				},
			})
			mocked.issueInterviewHandoff.mockResolvedValue({ ok: false, status: 500, message: 'boom' })
			const service = createCandidateProfileService(infra)

			const result = await service.startProfileInterview('u1', { occupation: 'Dev', level: 'Pleno' })

			// fluxo continua: o candidato só vai precisar fazer login
			expect(result.ok && result.data.interviewUrl).toBe(
				'https://interview.coploy.io/job/j1/company/c1/login',
			)
		})
	})
})
