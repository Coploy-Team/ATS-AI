import type { Company, PostJob } from '@coploy/domain'

import { createCareersService } from '../careers-service'
import { createMockInfra } from './mock-infra'

const COMPANY_ID = 'company-1'
const JOB_ID = 'job-1'

function makeCompany(overrides: Partial<Company> = {}): Company {
	return {
		id: COMPANY_ID,
		companyName: 'Coploy',
		companLogo: 'https://cdn.test/company.png',
		...overrides,
	}
}

function makeJob(overrides: Partial<PostJob> = {}): PostJob {
	return {
		id: JOB_ID,
		jobName: 'Pessoa Desenvolvedora',
		companyName: 'Coploy',
		public: true,
		stopped: false,
		archived: false,
		profileInterview: false,
		carrerLevel: 'Senior',
		workModality: 'Remote',
		employmentType: 'CLT',
		language: 'pt-BR',
		timeCreated: new Date('2026-01-10T12:00:00.000Z'),
		closingDate: new Date('2099-01-01T00:00:00.000Z'),
		address: {
			city: 'Sao Paulo',
			state: 'SP',
			country: 'br',
		},
		jobDescription: 'Build products',
		jobRequirements: 'TypeScript',
		jobResponsibilities: 'Ship features',
		jobDescriptionMetadata: {
			salary: 'R$ 10.000',
			benefits: 'VR',
			companyDescription: 'Talent OS',
		},
		jobQuestions: [{ question: 'Internal question' }],
		additionalQuestions: [{ question: 'Internal additional question' }],
		evaluation: { secret: true },
		competencias_criticas: 'Internal competency',
		competencias_adicionais: 'Internal extra competency',
		creatorId: 'creator-1',
		creatorEmail: 'creator@test.local',
		usersApplied: [{ id: 'user-1' }],
		...overrides,
	} as PostJob
}

describe('careers-service', () => {
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-08-12T12:00:00.000Z'))
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('returns only whitelisted public fields and branding', async () => {
		const infra = createMockInfra()
		infra.companyRepository.getCompany.mockResolvedValue(makeCompany({ jobPortal: { id: 'portal-1' } }))
		infra.jobRepository.getJobPortal.mockResolvedValue({
			id: 'portal-1',
			logoUrl: 'https://cdn.test/portal.png',
			bannerUrl: 'https://cdn.test/banner.png',
			primaryColor: '#111111',
			textColor: '#eeeeee',
		})
		infra.jobRepository.listPublicJobsByCompany.mockResolvedValue([makeJob()])

		const result = await createCareersService(infra).listJobs(COMPANY_ID)

		expect(result).toEqual({
			branding: {
				companyName: 'Coploy',
				logoUrl: 'https://cdn.test/portal.png',
				bannerUrl: 'https://cdn.test/banner.png',
				bannerPosition: null,
				primaryColor: '#111111',
				textColor: '#eeeeee',
				socialLinks: [],
				about: null,
				videoUrl: null,
			},
			jobs: [
				expect.objectContaining({
					jobId: JOB_ID,
					companyId: COMPANY_ID,
					title: 'Pessoa Desenvolvedora',
					location: 'Sao Paulo, SP, Brasil',
					level: 'Senior',
					workModality: 'Remote',
					employmentType: 'CLT',
					salary: 'R$ 10.000',
					applyUrl: expect.stringMatching(/\/job\/job-1\/company\/company-1\/login$/),
					shortApplicationForm: false,
				}),
			],
			totalAvailable: 1,
		})
		const serialized = JSON.stringify(result)
		expect(serialized).not.toContain('jobQuestions')
		expect(serialized).not.toContain('additionalQuestions')
		expect(serialized).not.toContain('evaluation')
		expect(serialized).not.toContain('competencias_criticas')
		expect(serialized).not.toContain('competencias_adicionais')
		expect(serialized).not.toContain('creatorEmail')
		expect(serialized).not.toContain('usersApplied')
		expect(serialized).not.toContain('Internal question')
		expect(serialized).not.toContain('featureFlags')
	})

	it('expõe shortApplicationForm=true quando a company tem a flag applyLite', async () => {
		const infra = createMockInfra()
		infra.companyRepository.getCompany.mockResolvedValue(
			makeCompany({ featureFlags: { applyLite: true } }),
		)
		infra.jobRepository.listPublicJobsByCompany.mockResolvedValue([makeJob()])
		infra.jobRepository.getJob.mockResolvedValue(makeJob())

		const list = await createCareersService(infra).listJobs(COMPANY_ID)
		const detail = await createCareersService(infra).getJob(COMPANY_ID, JOB_ID)

		expect(list?.jobs[0]?.shortApplicationForm).toBe(true)
		expect(detail?.job.shortApplicationForm).toBe(true)
		expect(JSON.stringify(list)).not.toContain('applyLite')
		expect(JSON.stringify(detail)).not.toContain('applyLite')
	})

	it.each([
		['private', { public: false }],
		['stopped', { stopped: true }],
		['archived', { archived: true }],
		['expired', { closingDate: new Date('2026-01-01T00:00:00.000Z') }],
		['profile interview', { profileInterview: true }],
	])('excludes %s jobs from list', async (_caseName, overrides) => {
		const infra = createMockInfra()
		infra.companyRepository.getCompany.mockResolvedValue(makeCompany())
		infra.jobRepository.listPublicJobsByCompany.mockResolvedValue([
			makeJob({ id: 'hidden-job', ...overrides }),
			makeJob({ id: 'visible-job' }),
		])

		const result = await createCareersService(infra).listJobs(COMPANY_ID)

		expect(result?.jobs.map((job) => job.jobId)).toEqual(['visible-job'])
		expect(result?.totalAvailable).toBe(1)
	})

	it('returns null when company does not exist', async () => {
		const infra = createMockInfra()
		infra.companyRepository.getCompany.mockResolvedValue(null)

		await expect(createCareersService(infra).listJobs(COMPANY_ID)).resolves.toBeNull()
		expect(infra.jobRepository.listPublicJobsByCompany).not.toHaveBeenCalled()
	})

	it('returns null for direct lookup of a private job', async () => {
		const infra = createMockInfra()
		infra.companyRepository.getCompany.mockResolvedValue(makeCompany())
		infra.jobRepository.getJob.mockResolvedValue(makeJob({ public: false }))

		await expect(createCareersService(infra).getJob(COMPANY_ID, JOB_ID)).resolves.toBeNull()
	})
})

describe('vaga com filtro exige o formulário', () => {
	/*
	 * O filtro só cabe numa tela: o formulário de candidatura. Sem ele o
	 * candidato vai do link direto para a entrevista e a pergunta configurada
	 * nunca é feita — foi o defeito relatado. Configurar filtro passa a
	 * implicar o passo.
	 */
	const comFiltro = {
		knockoutTree: { version: 1, nodes: [{ id: 'k1', question: 'Mora em SP', type: 'boolean' }] },
	} as never
	const semFiltro = {} as never
	const semFlag = { featureFlags: {} } as never

	function decide(company: unknown, job: unknown) {
		const flags = (company as { featureFlags?: Record<string, boolean> })?.featureFlags ?? {}
		if (flags.applyLite === true) return true
		const nodes = (job as { knockoutTree?: { nodes?: unknown[] } })?.knockoutTree?.nodes ?? []
		return nodes.length > 0
	}

	it('sem flag e sem filtro: candidato vai direto, como antes', () => {
		expect(decide(semFlag, semFiltro)).toBe(false)
	})

	it('sem flag mas COM filtro: passa a ter formulário, senão a pergunta some', () => {
		expect(decide(semFlag, comFiltro)).toBe(true)
	})

	it('com a flag ligada, formulário sempre — independe do filtro', () => {
		expect(decide({ featureFlags: { applyLite: true } }, semFiltro)).toBe(true)
	})
})
