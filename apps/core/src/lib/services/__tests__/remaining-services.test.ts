/**
 * Thin service delegates — user, feedback, dreamjobs, ia, job-portal
 * All delegate directly to infra repositories with no business logic.
 */
import { createUserService } from '../user-service'
import { createFeedbackService } from '../feedback-service'
import { createDreamJobsService } from '../dreamjobs-service'
import { createIaService } from '../ia-service'
import { createJobPortalService } from '../job-portal-service'
import { createMockInfra } from './mock-infra'

const COMPANY_ID = 'company-thin'
const USER_ID = 'user-thin'
const JOB_ID = 'job-thin'

// ─── createUserService ────────────────────────────────────────────────────────

describe('createUserService', () => {
	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createUserService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createUserService(infra)
	})

	it('getJobApplied delegates to candidateRepository', async () => {
		infra.candidateRepository.getJobApplied.mockResolvedValue({ id: 'ja-1' } as never)
		const result = await service.getJobApplied(USER_ID, 'ja-1')
		expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith(USER_ID, 'ja-1')
		expect(result).toEqual({ id: 'ja-1' })
	})

	it('listCandidateLikes delegates to candidateRepository', async () => {
		infra.candidateRepository.listCandidateLikes.mockResolvedValue([] as never)
		await service.listCandidateLikes(USER_ID, 'ja-1')
		expect(infra.candidateRepository.listCandidateLikes).toHaveBeenCalledWith(USER_ID, 'ja-1')
	})

	it('listCreditsUsed delegates to billingRepository', async () => {
		infra.billingRepository.listCreditsUsed.mockResolvedValue([])
		const opts = { limitTo: 10 }
		await service.listCreditsUsed(COMPANY_ID, opts)
		expect(infra.billingRepository.listCreditsUsed).toHaveBeenCalledWith(COMPANY_ID, opts)
	})
})

// ─── createFeedbackService ────────────────────────────────────────────────────

describe('createFeedbackService', () => {
	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createFeedbackService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createFeedbackService(infra)
	})

	it('listNps delegates to billingRepository', async () => {
		infra.billingRepository.listNps.mockResolvedValue([])
		const opts = { limitTo: 5 }
		await service.listNps(COMPANY_ID, opts)
		expect(infra.billingRepository.listNps).toHaveBeenCalledWith(COMPANY_ID, opts)
	})

	it('listNps delegates without options', async () => {
		infra.billingRepository.listNps.mockResolvedValue([])
		await service.listNps(COMPANY_ID)
		expect(infra.billingRepository.listNps).toHaveBeenCalledWith(COMPANY_ID, undefined)
	})
})

// ─── createDreamJobsService ───────────────────────────────────────────────────

describe('createDreamJobsService', () => {
	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createDreamJobsService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createDreamJobsService(infra)
	})

	it('getCandidateProfile delegates to userRepository', async () => {
		infra.userRepository.getCandidateProfile.mockResolvedValue({ userId: USER_ID } as never)
		const result = await service.getCandidateProfile(USER_ID)
		expect(infra.userRepository.getCandidateProfile).toHaveBeenCalledWith(USER_ID)
		expect(result).toEqual({ userId: USER_ID })
	})

	it('updateCandidateProfile delegates to userRepository', async () => {
		infra.userRepository.updateCandidateProfile.mockResolvedValue(undefined)
		await service.updateCandidateProfile(USER_ID, { bio: 'test' })
		expect(infra.userRepository.updateCandidateProfile).toHaveBeenCalledWith(USER_ID, { bio: 'test' })
	})

	it('getUser delegates to userRepository', async () => {
		infra.userRepository.getUser.mockResolvedValue({ id: USER_ID } as never)
		const result = await service.getUser(USER_ID)
		expect(infra.userRepository.getUser).toHaveBeenCalledWith(USER_ID)
		expect(result).toEqual({ id: USER_ID })
	})

	it('getJobApplied delegates to candidateRepository', async () => {
		infra.candidateRepository.getJobApplied.mockResolvedValue({ id: 'ja-1' } as never)
		await service.getJobApplied(USER_ID, 'ja-1')
		expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith(USER_ID, 'ja-1')
	})

	it('uploadFile delegates to storage', async () => {
		infra.storage.uploadFile.mockResolvedValue('https://url.com/file.jpg' as never)
		const result = await service.uploadFile(Buffer.from('x'), 'profiles', 'avatar', 'image/jpeg')
		expect(infra.storage.uploadFile).toHaveBeenCalledWith(Buffer.from('x'), 'profiles', 'avatar', 'image/jpeg')
		expect(result).toBe('https://url.com/file.jpg')
	})
})

// ─── createIaService ──────────────────────────────────────────────────────────

describe('createIaService', () => {
	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createIaService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createIaService(infra)
	})

	it('getUsersCompany delegates to userRepository', async () => {
		infra.userRepository.getUsersCompany.mockResolvedValue({ company: COMPANY_ID } as never)
		const result = await service.getUsersCompany(USER_ID)
		expect(infra.userRepository.getUsersCompany).toHaveBeenCalledWith(USER_ID)
		expect(result).toEqual({ company: COMPANY_ID })
	})

	it('getJob delegates to jobRepository', async () => {
		infra.jobRepository.getJob.mockResolvedValue({ id: JOB_ID } as never)
		const result = await service.getJob(COMPANY_ID, JOB_ID)
		expect(infra.jobRepository.getJob).toHaveBeenCalledWith(COMPANY_ID, JOB_ID)
		expect(result).toEqual({ id: JOB_ID })
	})
})

// ─── createJobPortalService ───────────────────────────────────────────────────

describe('createJobPortalService', () => {
	const PORTAL_ID = 'portal-001'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createJobPortalService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createJobPortalService(infra)
	})

	it('getJobPortal delegates to jobRepository', async () => {
		infra.jobRepository.getJobPortal.mockResolvedValue({ id: PORTAL_ID } as never)
		const result = await service.getJobPortal(PORTAL_ID)
		expect(infra.jobRepository.getJobPortal).toHaveBeenCalledWith(PORTAL_ID)
		expect(result).toEqual({ id: PORTAL_ID })
	})

	it('updateJobPortal delegates to jobRepository', async () => {
		infra.jobRepository.updateJobPortal.mockResolvedValue(undefined)
		await service.updateJobPortal(PORTAL_ID, { name: 'Updated' })
		expect(infra.jobRepository.updateJobPortal).toHaveBeenCalledWith(PORTAL_ID, { name: 'Updated' })
	})

	it('createJobPortal delegates to jobRepository with defaultDomainUrl', async () => {
		infra.jobRepository.createJobPortal.mockResolvedValue({ id: PORTAL_ID } as never)
		await service.createJobPortal({ name: 'Portal' }, 'https://domain.com')
		expect(infra.jobRepository.createJobPortal).toHaveBeenCalledWith({ name: 'Portal' }, 'https://domain.com')
	})

	it('uploadFile delegates to storage', async () => {
		infra.storage.uploadFile.mockResolvedValue('https://url.com/img.png' as never)
		const result = await service.uploadFile(Buffer.from('x'), 'portals', 'logo', 'image/png')
		expect(result).toBe('https://url.com/img.png')
	})

	it('updateCompany delegates to companyRepository', async () => {
		infra.companyRepository.updateCompany.mockResolvedValue(undefined)
		await service.updateCompany(COMPANY_ID, { jobPortal: PORTAL_ID })
		expect(infra.companyRepository.updateCompany).toHaveBeenCalledWith(COMPANY_ID, { jobPortal: PORTAL_ID })
	})
})
