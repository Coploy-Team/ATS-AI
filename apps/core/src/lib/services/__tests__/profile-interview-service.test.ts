jest.mock('@/env', () => ({
	env: {
		ENGINE_URL: 'http://engine.test',
		INTERVIEW_BASE_URL: 'https://interview.coploy.io',
		PROFILE_INTERVIEW_COMPANY_ID: 'coploy-profiles',
	},
}))

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }))
jest.mock('@/lib/ai-usage', () => ({ recordCoreAiUsage: jest.fn() }))

import axios from 'axios'

import { recordCoreAiUsage } from '@/lib/ai-usage'
import { createProfileInterviewService } from '../profile-interview-service'
import { createMockInfra } from './mock-infra'

const mockPost = (axios as unknown as { post: jest.Mock }).post

const CTX = { accessToken: 'candidate-id-token', requestId: 'req-1' }
const PARAMS = { occupation: 'Desenvolvedor Full Stack', level: 'Pleno' }

function stubEnginePipeline() {
	mockPost
		.mockResolvedValueOnce({
			data: {
				descricao: 'Descrição gerada',
				responsabilidades: 'Responsabilidades',
				requisitos: 'Requisitos',
				model: 'gpt-x',
				provider: 'openai',
				usage: { promptTokens: 10, completionTokens: 5 },
			},
		})
		.mockResolvedValueOnce({
			data: {
				competencias_criticas: 'React',
				competencias_adicionais: 'Node',
				expectativa: 'Entregar features',
				model: 'gpt-x',
				provider: 'openai',
				usage: { promptTokens: 8, completionTokens: 4 },
			},
		})
		.mockResolvedValueOnce({
			data: {
				perguntas: ['Pergunta 1', 'Pergunta 2', 'Pergunta 3'],
				model: 'gpt-x',
				provider: 'openai',
				usage: { promptTokens: 6, completionTokens: 3 },
			},
		})
}

function infraWithCandidate(overrides: Record<string, unknown> = {}) {
	const infra = createMockInfra()
	infra.userRepository.getUser.mockResolvedValue({ id: 'user-1', language: 'pt-BR', ...overrides })
	infra.companyRepository.getCompany.mockResolvedValue({ id: 'coploy-profiles', subscriptionPlan: 'free' })
	infra.jobRepository.createJob.mockResolvedValue({ id: 'mirror-job-1' })
	return infra
}

describe('profile-interview-service', () => {
	describe('provision', () => {
		it('gera a vaga-espelho invisível em listagens e mantém o tipo que publica no hunting', async () => {
			const infra = infraWithCandidate()
			stubEnginePipeline()
			const service = createProfileInterviewService(infra)

			const result = await service.provision('user-1', PARAMS, CTX)

			const [companyId, jobData] = infra.jobRepository.createJob.mock.calls[0]
			expect(companyId).toBe('coploy-profiles')
			// Invariantes do fluxo de perfil
			expect(jobData).toMatchObject({
				profileInterview: true,
				public: false,
				typeInterview: 'interview',
				jobName: 'Desenvolvedor Full Stack - Pleno',
			})
			expect(jobData.jobQuestions).toHaveLength(3)

			expect(result).toMatchObject({
				created: true,
				jobId: 'mirror-job-1',
				companyId: 'coploy-profiles',
				status: 'pending',
				questionCount: 3,
				interviewUrl: 'https://interview.coploy.io/job/mirror-job-1/company/coploy-profiles/login',
			})
		})

		it('vincula a entrevista ao candidato (marcador durável do fluxo)', async () => {
			const infra = infraWithCandidate()
			stubEnginePipeline()
			const service = createProfileInterviewService(infra)

			await service.provision('user-1', PARAMS, CTX)

			expect(infra.userRepository.updateUser).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({
					dreamJobsInterview: expect.objectContaining({ jobId: 'mirror-job-1', status: 'pending' }),
				}),
			)
		})

		it('é idempotente: candidato com entrevista não gera nova vaga nem novo custo de IA', async () => {
			const infra = infraWithCandidate({
				dreamJobsInterview: { jobId: 'existing-job', status: 'in_progress', createdAt: new Date('2026-08-01T00:00:00Z') },
			})
			infra.jobRepository.getJob.mockResolvedValue({ id: 'existing-job', jobName: 'Dev - Pleno', jobQuestions: [{ id: '1' }] })
			const service = createProfileInterviewService(infra)

			const result = await service.provision('user-1', PARAMS, CTX)

			expect(result).toMatchObject({ created: false, jobId: 'existing-job', status: 'in_progress' })
			expect(mockPost).not.toHaveBeenCalled()
			expect(infra.jobRepository.createJob).not.toHaveBeenCalled()
		})

		it('registra custo de IA das 3 gerações na empresa hospedeira', async () => {
			const infra = infraWithCandidate()
			stubEnginePipeline()
			const service = createProfileInterviewService(infra)

			await service.provision('user-1', PARAMS, CTX)

			const surfaces = (recordCoreAiUsage as jest.Mock).mock.calls.map((c) => c[0].surface)
			expect(surfaces).toEqual([
				'job_generate_description',
				'job_generate_skills',
				'job_generate_questions',
			])
		})

		it('injeta objetivos profissionais como contexto do cargo enviado ao engine', async () => {
			const infra = infraWithCandidate()
			stubEnginePipeline()
			const service = createProfileInterviewService(infra)

			await service.provision('user-1', { ...PARAMS, objectives: 'Migrar para arquitetura de dados' }, CTX)

			const [, body] = mockPost.mock.calls[0]
			expect(body.cargo).toContain('Objetivos: Migrar para arquitetura de dados')
			expect(body.idioma).toBe('pt')
		})

		it('recusa empresa hospedeira enterprise (resultado não iria pro hunting)', async () => {
			const infra = infraWithCandidate()
			infra.companyRepository.getCompany.mockResolvedValue({ id: 'coploy-profiles', subscriptionPlan: 'enterprise' })
			const service = createProfileInterviewService(infra)

			await expect(service.provision('user-1', PARAMS, CTX)).rejects.toThrow(/enterprise/i)
			expect(mockPost).not.toHaveBeenCalled()
		})

		it('falha claramente quando o engine não devolve perguntas', async () => {
			const infra = infraWithCandidate()
			mockPost
				.mockResolvedValueOnce({ data: { descricao: 'd', responsabilidades: 'r', requisitos: 'q' } })
				.mockResolvedValueOnce({ data: { competencias_criticas: null, competencias_adicionais: null, expectativa: null } })
				.mockResolvedValueOnce({ data: { perguntas: [] } })
			const service = createProfileInterviewService(infra)

			await expect(service.provision('user-1', PARAMS, CTX)).rejects.toThrow(/perguntas/i)
			expect(infra.jobRepository.createJob).not.toHaveBeenCalled()
		})
	})

	describe('getStatus', () => {
		it('retorna not_started para candidato sem entrevista de perfil', async () => {
			const infra = infraWithCandidate()
			const service = createProfileInterviewService(infra)

			expect(await service.getStatus('user-1')).toMatchObject({
				hasInterview: false,
				status: 'not_started',
				interviewUrl: null,
			})
		})

		/*
		 * O caso real que quebrou: o candidato terminou a entrevista e o ponteiro
		 * do usuário continuou dizendo "pendente" — nada nunca o avança, porque o
		 * único escritor é a rota que o app de entrevista chama. A entrevista
		 * concluída sumiu da área do candidato.
		 */
		it('diz concluída quando a entrevista foi respondida, mesmo com o ponteiro em pending', async () => {
			const infra = infraWithCandidate({
				dreamJobsInterview: { jobId: 'mirror-job-1', status: 'pending', createdAt: new Date('2026-08-01T00:00:00Z') },
			})
			infra.candidateRepository.listJobsApplied.mockResolvedValue([
				{
					id: 'ja-1',
					finished: true,
					finishedTime: new Date('2026-08-18T10:00:00Z'),
					jobApplied: { id: 'mirror-job-1' },
					companyOwner: { id: 'host-company' },
				},
			])

			const status = await createProfileInterviewService(infra).getStatus('user-1')

			expect(status).toMatchObject({
				status: 'completed',
				jobAppliedId: 'ja-1',
				completedAt: '2026-08-18T10:00:00.000Z',
				companyId: 'host-company',
			})
		})

		it('busca a entrevista pela vaga-espelho, não pelo ponteiro (que não guarda o jobAppliedId)', async () => {
			const infra = infraWithCandidate({
				dreamJobsInterview: { jobId: 'mirror-job-1', status: 'pending' },
			})

			await createProfileInterviewService(infra).getStatus('user-1')

			expect(infra.candidateRepository.listJobsApplied).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({
					filters: [{ field: 'jobApplied.id', operator: '==', value: 'mirror-job-1' }],
				}),
			)
		})

		it('não paga a leitura extra quando o ponteiro já diz concluída', async () => {
			const infra = infraWithCandidate({
				dreamJobsInterview: { jobId: 'mirror-job-1', status: 'completed' },
			})

			const status = await createProfileInterviewService(infra).getStatus('user-1')

			expect(status.status).toBe('completed')
			expect(infra.candidateRepository.listJobsApplied).not.toHaveBeenCalled()
		})

		it('expõe status e link para continuar a entrevista existente', async () => {
			const infra = infraWithCandidate({
				dreamJobsInterview: { jobId: 'job-9', status: 'completed', completedAt: new Date('2026-08-05T12:00:00Z') },
			})
			const service = createProfileInterviewService(infra)

			expect(await service.getStatus('user-1')).toMatchObject({
				hasInterview: true,
				status: 'completed',
				jobId: 'job-9',
				completedAt: '2026-08-05T12:00:00.000Z',
				interviewUrl: 'https://interview.coploy.io/job/job-9/company/coploy-profiles/login',
			})
		})
	})
})
