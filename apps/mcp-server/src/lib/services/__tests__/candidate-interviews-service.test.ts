jest.mock('@/env', () => ({
	env: {
		FIREBASE_API_KEY: undefined,
		INTERVIEW_BASE_URL: 'https://interview.coploy.io',
		ORCHESTRATOR_BASE_URL: 'http://localhost:4444',
		CORE_BASE_URL: 'http://core.test',
	},
}))

jest.mock('@/lib/core-client', () => ({
	issueInterviewHandoff: jest.fn(),
	getMyInterviews: jest.fn(),
	getMyInsights: jest.fn(),
}))

jest.mock('@/lib/orchestrator-client', () => ({
	getInterviewSession: jest.fn(),
}))

import type { PostJob } from '@coploy/domain'

import * as coreClient from '@/lib/core-client'
import { getInterviewSession } from '@/lib/orchestrator-client'
import { createCandidateInterviewsService } from '../candidate-interviews-service'
import { createMockInfra } from './mock-infra'

const mockGetInterviewSession = getInterviewSession as jest.MockedFunction<typeof getInterviewSession>
const mocked = coreClient as jest.Mocked<typeof coreClient>

beforeEach(() => {
	// Sem handoff por padrão: o link degrada pro fluxo com login, que é o
	// comportamento esperado quando a emissão falha.
	mocked.issueInterviewHandoff.mockResolvedValue({ ok: false, status: 500, message: 'no handoff' })
})

function makePublicJob(): PostJob {
	return {
		id: 'job-1',
		jobName: 'Dev Pleno',
		companyName: 'Acme',
		public: true,
		stopped: false,
		archived: false,
		jobQuestions: [{ id: 'q1', question: 'p1' }],
	} as PostJob
}

function makeSession(overrides: Record<string, unknown> = {}) {
	return {
		id: 'ja-1',
		company: { name: 'Acme', description: '', logoURL: '' },
		job: {
			name: 'Dev Pleno',
			awserQuestion: 0,
			totalQuestion: 5,
			done: false,
			archived: false,
			stopped: false,
			language: 'pt-BR',
			typeInterview: 'interview',
			interviewMode: 'video',
			...overrides,
		},
	}
}

describe('candidate-interviews-service', () => {
	describe('startInterview', () => {
		it('prepara a sessão via orchestrator e devolve o link da entrevista', async () => {
			const infra = createMockInfra()
			infra.jobRepository.getJob.mockResolvedValue(makePublicJob())
			infra.auth.createCustomToken.mockResolvedValue('minted-token')
			mockGetInterviewSession.mockResolvedValue(makeSession() as never)
			const service = createCandidateInterviewsService(infra)

			const result = await service.startInterview('uid-1', 'company-1', 'job-1')

			expect(mockGetInterviewSession).toHaveBeenCalledWith('company-1', 'job-1', 'minted-token')
			expect(result).toMatchObject({
				jobName: 'Dev Pleno',
				questionsTotal: 5,
				interviewFinished: false,
				status: 'not_started',
				interviewUrl: 'https://interview.coploy.io/job/job-1/company/company-1/login',
			})
		})

		it('deriva status in_progress e finished do progresso real da entrevista', async () => {
			const infra = createMockInfra()
			infra.jobRepository.getJob.mockResolvedValue(makePublicJob())
			const service = createCandidateInterviewsService(infra)

			mockGetInterviewSession.mockResolvedValueOnce(makeSession({ awserQuestion: 2 }) as never)
			expect((await service.startInterview('uid-1', 'c', 'j'))?.status).toBe('in_progress')

			mockGetInterviewSession.mockResolvedValueOnce(makeSession({ awserQuestion: 5, done: true }) as never)
			expect((await service.startInterview('uid-1', 'c', 'j'))?.status).toBe('finished')
		})

		it('retorna null (sem chamar orchestrator) pra vaga privada/encerrada', async () => {
			const infra = createMockInfra()
			infra.jobRepository.getJob.mockResolvedValue({ ...makePublicJob(), public: false })
			const service = createCandidateInterviewsService(infra)

			expect(await service.startInterview('uid-1', 'company-1', 'job-1')).toBeNull()
			expect(mockGetInterviewSession).not.toHaveBeenCalled()
		})

		it('propaga erro quando o orchestrator falha (não silencia sessão perdida)', async () => {
			const infra = createMockInfra()
			infra.jobRepository.getJob.mockResolvedValue(makePublicJob())
			mockGetInterviewSession.mockResolvedValue(null)
			const service = createCandidateInterviewsService(infra)

			await expect(service.startInterview('uid-1', 'company-1', 'job-1')).rejects.toThrow(
				'Interview session could not be created',
			)
		})
	})

	describe('listMyInterviews', () => {
	})
})

describe('listMyInterviews / getInsights', () => {
	const summary = (overrides: Record<string, unknown> = {}) => ({
		id: 'i1',
		jobId: 'j1',
		companyId: 'c1',
		jobName: 'Dev',
		companyName: 'Acme',
		companyLogo: null,
		startedAt: null,
		completedAt: null,
		finished: false,
		status: 'pending' as const,
		questionsAnswered: 0,
		questionsTotal: 5,
		interviewUrl: 'https://interview.coploy.io/job/j1/company/c1/login',
		feedback: { strengths: [], development: [], suggestions: [] },
		...overrides,
	})

	it('preserva a separação que o core faz entre perfil e empresas', async () => {
		const infra = createMockInfra()
		mocked.getMyInterviews.mockResolvedValue({
			ok: true,
			data: {
				profileInterview: summary({ id: 'perfil' }),
				companyInterviews: [summary({ id: 'empresa' })],
			},
		})
		mocked.issueInterviewHandoff.mockResolvedValue({ ok: true, data: { code: 'T1', expiresAt: 'x' } })
		const service = createCandidateInterviewsService(infra)

		const result = await service.listMyInterviews('u1')

		expect(result.profileInterview?.id).toBe('perfil')
		expect(result.companyInterviews.map((i) => i.id)).toEqual(['empresa'])
		expect(result.total).toBe(2)
	})

	it('gasta UM ticket para a lista inteira, não um por entrevista', async () => {
		const infra = createMockInfra()
		mocked.getMyInterviews.mockResolvedValue({
			ok: true,
			data: {
				profileInterview: summary({ id: 'perfil' }),
				companyInterviews: [summary({ id: 'a' }), summary({ id: 'b' })],
			},
		})
		mocked.issueInterviewHandoff.mockResolvedValue({ ok: true, data: { code: 'T1', expiresAt: 'x' } })
		const service = createCandidateInterviewsService(infra)

		const result = await service.listMyInterviews('u1')

		expect(mocked.issueInterviewHandoff).toHaveBeenCalledTimes(1)
		expect(result.companyInterviews.every((i) => i.interviewUrl.includes('handoff=T1'))).toBe(true)
	})

	it('não emite ticket quando está tudo concluído — link fechado não abre nada', async () => {
		const infra = createMockInfra()
		mocked.getMyInterviews.mockResolvedValue({
			ok: true,
			data: {
				profileInterview: summary({ status: 'completed', finished: true }),
				companyInterviews: [summary({ status: 'completed', finished: true })],
			},
		})
		const service = createCandidateInterviewsService(infra)

		await service.listMyInterviews('u1')

		expect(mocked.issueInterviewHandoff).not.toHaveBeenCalled()
	})

	it('degrada sem quebrar quando o core não responde', async () => {
		const infra = createMockInfra()
		mocked.getMyInterviews.mockResolvedValue({ ok: false, status: 500, message: 'x' })
		const service = createCandidateInterviewsService(infra)

		expect(await service.listMyInterviews('u1')).toEqual({
			profileInterview: null,
			companyInterviews: [],
			total: 0,
		})
	})

	it('repassa os insights do core sem inventar veredito', async () => {
		const infra = createMockInfra()
		mocked.getMyInsights.mockResolvedValue({
			ok: true,
			data: {
				interviewsAnalyzed: 3,
				dimensionRanking: ['structure', 'depth', 'examples'],
				strongestDimension: 'structure',
				dimensionToImprove: 'examples',
				improvingDimensions: [],
				recurringStrengths: ['Comunicação'],
				recurringDevelopment: [],
				suggestions: ['Traga exemplos concretos'],
			},
		})
		const service = createCandidateInterviewsService(infra)

		const insights = await service.getInsights('u1')

		expect(insights?.strongestDimension).toBe('structure')
		expect(JSON.stringify(insights)).not.toMatch(/score|aprovad|pontuacao/i)
	})
})
