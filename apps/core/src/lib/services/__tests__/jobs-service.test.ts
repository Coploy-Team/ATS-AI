import { BadRequestError } from '@coploy/shared/errors'
import { createJobsService } from '../jobs-service'
import { createMockInfra } from './mock-infra'

describe('createJobsService', () => {
	const COMPANY_ID = 'company-123'
	const USER_ID = 'user-abc'
	const JOB_ID = 'job-xyz'
	const INFO_JOB_ID = 'infojob-001'

	const mockJob = { id: JOB_ID, companyId: COMPANY_ID, title: 'Engenheiro' }
	const mockInfoJob = { id: INFO_JOB_ID, companyId: COMPANY_ID, name: 'Triagem dev' }
	const mockUsersCompany = { id: USER_ID, company: COMPANY_ID }

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createJobsService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createJobsService(infra)
	})

	// ─── Direct accessors ────────────────────────────────────────────────────

	describe('getJob', () => {
		it('delegates to jobRepository.getJob', async () => {
			infra.jobRepository.getJob.mockResolvedValue(mockJob as never)

			const result = await service.getJob(COMPANY_ID, JOB_ID)

			expect(infra.jobRepository.getJob).toHaveBeenCalledWith(COMPANY_ID, JOB_ID)
			expect(result).toEqual(mockJob)
		})

		it('returns null when job not found', async () => {
			infra.jobRepository.getJob.mockResolvedValue(null)

			expect(await service.getJob(COMPANY_ID, JOB_ID)).toBeNull()
		})
	})

	describe('listJobs', () => {
		it('delegates to jobRepository.listJobs', async () => {
			infra.jobRepository.listJobs.mockResolvedValue([mockJob] as never)

			const result = await service.listJobs(COMPANY_ID)

			expect(infra.jobRepository.listJobs).toHaveBeenCalledWith(COMPANY_ID, undefined)
			expect(result).toEqual([mockJob])
		})

		it('forwards options', async () => {
			infra.jobRepository.listJobs.mockResolvedValue([])
			const options = { filters: [{ field: 'stopped', operator: '==' as const, value: false }] }

			await service.listJobs(COMPANY_ID, options)

			expect(infra.jobRepository.listJobs).toHaveBeenCalledWith(COMPANY_ID, options)
		})
	})

	describe('getInfoJob', () => {
		it('delegates to jobRepository.getInfoJob', async () => {
			infra.jobRepository.getInfoJob.mockResolvedValue(mockInfoJob as never)

			const result = await service.getInfoJob(COMPANY_ID, INFO_JOB_ID)

			expect(infra.jobRepository.getInfoJob).toHaveBeenCalledWith(COMPANY_ID, INFO_JOB_ID)
			expect(result).toEqual(mockInfoJob)
		})
	})

	describe('listInfoJobs', () => {
		it('delegates to jobRepository.listInfoJobs', async () => {
			infra.jobRepository.listInfoJobs.mockResolvedValue([mockInfoJob] as never)

			const result = await service.listInfoJobs(COMPANY_ID)

			expect(infra.jobRepository.listInfoJobs).toHaveBeenCalledWith(COMPANY_ID)
			expect(result).toEqual([mockInfoJob])
		})
	})

	describe('listJobInterviews', () => {
		it('delegates to candidateRepository.listJobInterviews', async () => {
			const mockInterviews = [{ id: 'i1', jobId: JOB_ID }]
			infra.candidateRepository.listJobInterviews.mockResolvedValue(mockInterviews as never)

			const result = await service.listJobInterviews(COMPANY_ID, JOB_ID)

			expect(infra.candidateRepository.listJobInterviews).toHaveBeenCalledWith(COMPANY_ID, JOB_ID, undefined)
			expect(result).toEqual(mockInterviews)
		})
	})

	describe('listCompanyInterviews', () => {
		it('delegates to candidateRepository.listCompanyInterviews', async () => {
			infra.candidateRepository.listCompanyInterviews.mockResolvedValue([])

			await service.listCompanyInterviews(COMPANY_ID)

			expect(infra.candidateRepository.listCompanyInterviews).toHaveBeenCalledWith(COMPANY_ID, undefined)
		})
	})

	describe('processJobsQuery', () => {
		const baseFilters = {
			status: 'active',
			interviewType: ['all'],
			showArchived: false,
			language: 'all',
			segment: 'all',
			level: 'all',
			education: 'all',
			country: 'all',
			state: 'all',
			city: 'all',
			candidatesLimit: 50,
			priority: 'all' as const,
		}

		it('adds interviewMode filter when provided', async () => {
			infra.jobRepository.listJobs.mockResolvedValue([])

			await service.processJobsQuery(COMPANY_ID, {
				...baseFilters,
				interviewMode: 'whatsapp',
			})

			expect(infra.jobRepository.listJobs).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({
					filters: expect.arrayContaining([
						{ field: 'interviewMode', operator: '==', value: 'whatsapp' },
					]),
				}),
			)
		})

		/*
		 * O recrutador enxerga só o que criou (papel `recruiter`, decisão do
		 * Henrique em 28/08). Se o `creatorId` que o cliente manda pudesse
		 * vencer, a parede cairia trocando um parâmetro na URL — por isso o
		 * alcance da sessão entra ANTES e sobrepõe.
		 */
		it('escopo próprio filtra pelo criador da sessão', async () => {
			infra.jobRepository.listJobs.mockResolvedValue([])

			await service.processJobsQuery(COMPANY_ID, {
				...baseFilters,
				scope: 'own',
				scopedToUserId: 'recrutadora-1',
			})

			expect(infra.jobRepository.listJobs).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({
					filters: expect.arrayContaining([
						{ field: 'creatorId', operator: '==', value: 'recrutadora-1' },
					]),
				}),
			)
		})

		it('escopo próprio ignora o creatorId que o cliente mandar', async () => {
			infra.jobRepository.listJobs.mockResolvedValue([])

			await service.processJobsQuery(COMPANY_ID, {
				...baseFilters,
				// tentativa de olhar a vaga de outra pessoa pela URL
				creatorId: 'colega-2',
				scope: 'own',
				scopedToUserId: 'recrutadora-1',
			})

			const [, options] = infra.jobRepository.listJobs.mock.calls[0]
			const porCriador = (options?.filters ?? []).filter(
				(f: { field: string }) => f.field === 'creatorId',
			)
			expect(porCriador).toEqual([
				{ field: 'creatorId', operator: '==', value: 'recrutadora-1' },
			])
		})

		it('escopo amplo continua respeitando o filtro de recrutador da tela', async () => {
			infra.jobRepository.listJobs.mockResolvedValue([])

			await service.processJobsQuery(COMPANY_ID, {
				...baseFilters,
				creatorId: 'colega-2',
				scope: 'all',
			})

			expect(infra.jobRepository.listJobs).toHaveBeenCalledWith(
				COMPANY_ID,
				expect.objectContaining({
					filters: expect.arrayContaining([
						{ field: 'creatorId', operator: '==', value: 'colega-2' },
					]),
				}),
			)
		})

		it('does not add interviewMode filter when omitted', async () => {
			infra.jobRepository.listJobs.mockResolvedValue([])

			await service.processJobsQuery(COMPANY_ID, baseFilters)

			const [, options] = infra.jobRepository.listJobs.mock.calls[0]
			expect(options?.filters).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ field: 'interviewMode' }),
				]),
			)
		})
	})

	describe('getUsersCompany', () => {
		it('delegates to userRepository.getUsersCompany', async () => {
			infra.userRepository.getUsersCompany.mockResolvedValue(mockUsersCompany as never)

			const result = await service.getUsersCompany(USER_ID)

			expect(infra.userRepository.getUsersCompany).toHaveBeenCalledWith(USER_ID)
			expect(result).toEqual(mockUsersCompany)
		})
	})

	// ─── Mutations with business logic ───────────────────────────────────────

	describe('deleteJob', () => {
		it('deletes job when it exists', async () => {
			infra.jobRepository.getJob.mockResolvedValue(mockJob as never)
			infra.jobRepository.deleteJob.mockResolvedValue(undefined)

			await service.deleteJob(COMPANY_ID, JOB_ID)

			expect(infra.jobRepository.getJob).toHaveBeenCalledWith(COMPANY_ID, JOB_ID)
			expect(infra.jobRepository.deleteJob).toHaveBeenCalledWith(COMPANY_ID, JOB_ID)
		})

		it('throws BadRequestError when job does not exist', async () => {
			infra.jobRepository.getJob.mockResolvedValue(null)

			await expect(service.deleteJob(COMPANY_ID, JOB_ID)).rejects.toThrow(BadRequestError)
			expect(infra.jobRepository.deleteJob).not.toHaveBeenCalled()
		})
	})

	describe('deleteInfoJob', () => {
		it('deletes info job when it exists', async () => {
			infra.jobRepository.getInfoJob.mockResolvedValue(mockInfoJob as never)
			infra.jobRepository.deleteInfoJob.mockResolvedValue(undefined)

			await service.deleteInfoJob(COMPANY_ID, INFO_JOB_ID)

			expect(infra.jobRepository.getInfoJob).toHaveBeenCalledWith(COMPANY_ID, INFO_JOB_ID)
			expect(infra.jobRepository.deleteInfoJob).toHaveBeenCalledWith(COMPANY_ID, INFO_JOB_ID)
		})

		it('throws BadRequestError when info job does not exist', async () => {
			infra.jobRepository.getInfoJob.mockResolvedValue(null)

			await expect(service.deleteInfoJob(COMPANY_ID, INFO_JOB_ID)).rejects.toThrow(BadRequestError)
			expect(infra.jobRepository.deleteInfoJob).not.toHaveBeenCalled()
		})
	})

	describe('updateInfoJob', () => {
		it('updates info job when it exists', async () => {
			infra.jobRepository.getInfoJob.mockResolvedValue(mockInfoJob as never)
			infra.jobRepository.updateInfoJob.mockResolvedValue(undefined)
			const data = { name: 'Updated name' }

			await service.updateInfoJob(COMPANY_ID, INFO_JOB_ID, data)

			expect(infra.jobRepository.updateInfoJob).toHaveBeenCalledWith(COMPANY_ID, INFO_JOB_ID, data)
		})

		it('throws BadRequestError when info job not found', async () => {
			infra.jobRepository.getInfoJob.mockResolvedValue(null)

			await expect(
				service.updateInfoJob(COMPANY_ID, INFO_JOB_ID, { name: 'x' }),
			).rejects.toThrow(BadRequestError)
		})
	})

	describe('createInfoJob', () => {
		it('creates info job with plain text content (no base64 video)', async () => {
			const createdDoc = { ...mockInfoJob, id: INFO_JOB_ID }
			infra.jobRepository.createInfoJob.mockResolvedValue(createdDoc as never)

			const data = {
				name: 'Nova triagem',
				finishText: 'Obrigado!',
				finishVideo: '',
				welcomeText: 'Bem-vindo',
				welcomeVideo: '',
			}

			const result = await service.createInfoJob(COMPANY_ID, data)

			expect(infra.jobRepository.createInfoJob).toHaveBeenCalled()
			expect(infra.storage.uploadFile).not.toHaveBeenCalled()
			expect(result).toEqual({ infoJobsId: INFO_JOB_ID })
		})

		it('uploads base64 welcome video before saving', async () => {
			const createdDoc = { ...mockInfoJob, id: INFO_JOB_ID }
			infra.jobRepository.createInfoJob.mockResolvedValue(createdDoc as never)
			infra.storage.uploadFile.mockResolvedValue('https://cdn.example.com/welcome.mp4')

			const data = {
				name: 'Com video',
				finishText: 'Fim',
				finishVideo: '',
				welcomeText: 'Início',
				welcomeVideo: 'data:video/mp4;base64,AAABBB==',
			}

			const result = await service.createInfoJob(COMPANY_ID, data)

			expect(infra.storage.uploadFile).toHaveBeenCalledTimes(1)
			expect(result).toEqual({ infoJobsId: INFO_JOB_ID })
		})
	})

	describe('createJob', () => {
		beforeEach(() => {
			infra.userRepository.getUsersCompany.mockResolvedValue({
				id: USER_ID,
				company: { id: COMPANY_ID },
				display_name: 'Recruiter',
				email: 'recruiter@example.com',
			} as never)
			infra.companyRepository.getCompany.mockResolvedValue({
				id: COMPANY_ID,
				companyName: 'Coploy',
			} as never)
			infra.jobRepository.createJob.mockResolvedValue({ id: JOB_ID } as never)
		})

		it('creates a legacy-compatible job without structured requirements', async () => {
			await service.createJob(USER_ID, {
				jobName: 'Pessoa Desenvolvedora',
				typeInterview: 'interview',
				jobRequirements: 'Experiencia com TypeScript',
			})

			expect(infra.jobRepository.createJob).toHaveBeenCalledTimes(1)
			const [, payload] = infra.jobRepository.createJob.mock.calls[0]
			expect(payload).toMatchObject({
				jobName: 'Pessoa Desenvolvedora',
				typeInterview: 'interview',
				jobRequirements: 'Experiencia com TypeScript',
			})
			expect(payload).not.toHaveProperty('structuredRequirements')
		})

		it('creates a job with structured requirements when provided', async () => {
			const structuredRequirements = [
				{
					id: 'req-1',
					label: 'Experiencia com TypeScript',
					skill: 'typescript',
					weight: 3,
					required: true,
				},
			]

			await service.createJob(USER_ID, {
				jobName: 'Pessoa Desenvolvedora',
				typeInterview: 'interview',
				jobRequirements: 'Experiencia com TypeScript',
				structuredRequirements,
			})

			const [, payload] = infra.jobRepository.createJob.mock.calls[0]
			expect(payload).toMatchObject({
				jobName: 'Pessoa Desenvolvedora',
				structuredRequirements,
			})
		})
	})
})
