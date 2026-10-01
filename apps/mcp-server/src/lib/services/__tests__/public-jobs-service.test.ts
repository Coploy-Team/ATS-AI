import type { PostJob } from '@coploy/domain'

// Mock do @/env (padrão orchestrator): isola o teste de .env locais,
// que o dotenv carrega com override e mudaria o INTERVIEW_BASE_URL.
jest.mock('@/env', () => ({
	env: { INTERVIEW_BASE_URL: 'https://interview.coploy.io' },
}))

import { createPublicJobsService } from '../public-jobs-service'
import { createMockInfra } from './mock-infra'

type PublicJob = PostJob & { companyId: string }

function makeJob(overrides: Partial<PublicJob> = {}): PublicJob {
	return {
		id: 'job-1',
		companyId: 'company-1',
		jobName: 'Senior Product Manager',
		companyName: 'Acme',
		public: true,
		stopped: false,
		archived: false,
		language: 'pt-BR',
		mainSkills: 'roadmap, discovery, SQL',
		workModality: 'Remoto',
		employmentType: 'CLT',
		carrerLevel: 'Senior',
		timeCreated: new Date('2026-08-01T12:00:00.000Z'),
		address: { city: 'São Paulo', state: 'SP', country: 'Brasil' },
		jobDescriptionMetadata: { salary: 'R$ 15.000 - R$ 18.000' },
		jobQuestions: [{ id: 'q1', question: 'pergunta secreta da entrevista' }],
		...overrides,
	} as PublicJob
}

describe('public-jobs-service', () => {
	describe('searchJobs', () => {
		it('retorna somente vagas abertas (exclui stopped, archived e closingDate passada)', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue([
				makeJob({ id: 'open' }),
				makeJob({ id: 'stopped', stopped: true }),
				makeJob({ id: 'archived', archived: true }),
				makeJob({ id: 'closed', closingDate: new Date('2020-01-01T00:00:00.000Z') }),
				makeJob({ id: 'future-closing', closingDate: new Date('2030-01-01T00:00:00.000Z') }),
			])
			const service = createPublicJobsService(infra)

			const { jobs } = await service.searchJobs()

			expect(jobs.map((j) => j.jobId)).toEqual(['open', 'future-closing'])
		})

		it('filtra por idioma normalizando prefixo (pt-BR casa pt e pt-BR; sem idioma é legado pt-BR)', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue([
				makeJob({ id: 'pt-br', language: 'pt-BR' }),
				makeJob({ id: 'pt', language: 'pt' }),
				makeJob({ id: 'en', language: 'en' }),
				makeJob({ id: 'legacy-null', language: null }),
			])
			const service = createPublicJobsService(infra)

			const { jobs: ptJobs } = await service.searchJobs({ language: 'pt-BR' })
			const { jobs: enJobs } = await service.searchJobs({ language: 'en' })

			expect(ptJobs.map((j) => j.jobId)).toEqual(['pt-br', 'pt', 'legacy-null'])
			expect(enJobs.map((j) => j.jobId)).toEqual(['en'])
		})

		it('busca texto livre com AND entre tokens sobre nome/skills/local', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue([
				makeJob({ id: 'match', jobName: 'Product Manager', workModality: 'Remoto' }),
				makeJob({ id: 'partial', jobName: 'Product Designer', workModality: 'Presencial' }),
				makeJob({ id: 'skills-match', jobName: 'Gerente', mainSkills: 'product, remoto' }),
			])
			const service = createPublicJobsService(infra)

			const { jobs } = await service.searchJobs({ query: 'product remoto' })

			expect(jobs.map((j) => j.jobId)).toEqual(['match', 'skills-match'])
		})

		it('aplica limit default 10 e teto 25', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue(
				Array.from({ length: 60 }, (_, i) => makeJob({ id: `job-${i}` })),
			)
			const service = createPublicJobsService(infra)

			expect((await service.searchJobs()).jobs).toHaveLength(10)
			expect((await service.searchJobs({ limit: 100 })).jobs).toHaveLength(25)
			expect((await service.searchJobs({ limit: 3 })).jobs).toHaveLength(3)
		})

		it('monta summary com whitelist: applyUrl no formato do gupy-connector, datas ISO, sem perguntas da entrevista', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue([makeJob()])
			const service = createPublicJobsService(infra)

			const { jobs: [job] } = await service.searchJobs()

			expect(job).toEqual({
				jobId: 'job-1',
				companyId: 'company-1',
				// `title` é o campo do PROTOCOLO (OTS 0.1); jobName é legado do widget
				title: 'Senior Product Manager',
				jobName: 'Senior Product Manager',
				companyName: 'Acme',
				companyLogo: null,
				location: 'São Paulo, SP, Brasil',
				workModality: 'Remoto',
				employmentType: 'CLT',
				careerLevel: 'Senior',
				language: 'pt-BR',
				salary: 'R$ 15.000 - R$ 18.000',
				mainSkills: 'roadmap, discovery, SQL',
				postedAt: '2026-08-01T12:00:00.000Z',
				interviewUrl: 'https://interview.coploy.io/job/job-1/company/company-1/login',
			})
			expect(JSON.stringify(job)).not.toContain('pergunta secreta')
		})

		it('nunca lista vaga-espelho de entrevista de perfil (é candidato, não vaga)', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue([
				makeJob({ id: 'real' }),
				// legado do fluxo antigo: criada com public=true
				makeJob({ id: 'profile-legacy', profileInterview: true } as never),
			])
			const service = createPublicJobsService(infra)

			const { jobs, totalAvailable } = await service.searchJobs()

			expect(jobs.map((j) => j.jobId)).toEqual(['real'])
			expect(totalAvailable).toBe(1)
		})

		it('limpa endereço sujo do form: "-" vira null e sigla de país vira nome', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue([
				makeJob({ id: 'a', address: { city: '-', state: '-', country: 'br' } } as never),
				makeJob({ id: 'b', address: { city: 'Recife', state: 'PE', country: 'br' } } as never),
				makeJob({ id: 'c', address: { city: '', state: '', country: '' } } as never),
			])
			const service = createPublicJobsService(infra)

			const { jobs } = await service.searchJobs()

			expect(jobs.map((j) => j.location)).toEqual(['Brasil', 'Recife, PE, Brasil', null])
		})

		it('reporta totalAvailable (antes do limit) pra habilitar "mostrar mais"', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue(
				Array.from({ length: 30 }, (_, i) => makeJob({ id: `job-${i}` })),
			)
			const service = createPublicJobsService(infra)

			const result = await service.searchJobs({ limit: 5 })

			expect(result.jobs).toHaveLength(5)
			expect(result.totalAvailable).toBe(30)
		})

		it('enriquece companyLogo com 1 fetch por empresa distinta (não por vaga)', async () => {
			const infra = createMockInfra()
			infra.jobRepository.listPublicJobs.mockResolvedValue([
				makeJob({ id: 'a', companyId: 'company-1' } as never),
				makeJob({ id: 'b', companyId: 'company-1' } as never),
				makeJob({ id: 'c', companyId: 'company-2' } as never),
			])
			infra.companyRepository.getCompany.mockImplementation((id: string) =>
				Promise.resolve({ id, companLogo: `https://cdn/${id}.png` } as never),
			)
			const service = createPublicJobsService(infra)

			const { jobs } = await service.searchJobs()

			expect(infra.companyRepository.getCompany).toHaveBeenCalledTimes(2)
			expect(jobs.map((j) => j.companyLogo)).toEqual([
				'https://cdn/company-1.png',
				'https://cdn/company-1.png',
				'https://cdn/company-2.png',
			])
		})
	})

	describe('getJobDetails', () => {
		it('retorna null pra vaga inexistente, privada ou encerrada (guard anti-vazamento)', async () => {
			const infra = createMockInfra()
			const service = createPublicJobsService(infra)

			infra.jobRepository.getJob.mockResolvedValueOnce(null)
			expect(await service.getJobDetails('company-1', 'missing')).toBeNull()

			infra.jobRepository.getJob.mockResolvedValueOnce(makeJob({ public: false }))
			expect(await service.getJobDetails('company-1', 'private')).toBeNull()

			infra.jobRepository.getJob.mockResolvedValueOnce(makeJob({ stopped: true }))
			expect(await service.getJobDetails('company-1', 'stopped')).toBeNull()
		})

		it('expõe questionCount mas nunca o conteúdo das perguntas', async () => {
			const infra = createMockInfra()
			infra.jobRepository.getJob.mockResolvedValue(
				makeJob({
					generatedJobDescription: 'Descrição gerada',
					jobRequirements: 'Requisitos',
					jobResponsibilities: 'Responsabilidades',
					jobQuestions: [
						{ id: 'q1', question: 'pergunta secreta 1' },
						{ id: 'q2', question: 'pergunta secreta 2' },
					],
				}),
			)
			const service = createPublicJobsService(infra)

			const details = await service.getJobDetails('company-1', 'job-1')

			expect(details).not.toBeNull()
			expect(details?.questionCount).toBe(2)
			expect(details?.description).toBe('Descrição gerada')
			expect(JSON.stringify(details)).not.toContain('pergunta secreta')
		})

		it('faz fallback do campo legado jobResponsabilities (typo) quando jobResponsibilities é null', async () => {
			const infra = createMockInfra()
			infra.jobRepository.getJob.mockResolvedValue(
				makeJob({ jobResponsibilities: null, jobResponsabilities: 'Legado com typo' }),
			)
			const service = createPublicJobsService(infra)

			const details = await service.getJobDetails('company-1', 'job-1')

			expect(details?.responsibilities).toBe('Legado com typo')
		})
	})
})
