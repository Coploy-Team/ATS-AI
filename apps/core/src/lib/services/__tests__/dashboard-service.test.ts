import { createDashboardService } from '../dashboard-service'
import { createMockInfra } from './mock-infra'

describe('createDashboardService', () => {
	const COMPANY_ID = 'company-dash'
	const USER_ID = 'user-001'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createDashboardService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createDashboardService(infra)
	})

	it('getUsersCompany delegates to userRepository', async () => {
		const mockMembership = { id: USER_ID, company: COMPANY_ID }
		infra.userRepository.getUsersCompany.mockResolvedValue(mockMembership as never)

		const result = await service.getUsersCompany(USER_ID)

		expect(infra.userRepository.getUsersCompany).toHaveBeenCalledWith(USER_ID)
		expect(result).toEqual(mockMembership)
	})

	it('getCompany delegates to companyRepository', async () => {
		const mockCompany = { id: COMPANY_ID, companyName: 'Teste' }
		infra.companyRepository.getCompany.mockResolvedValue(mockCompany as never)

		const result = await service.getCompany(COMPANY_ID)

		expect(infra.companyRepository.getCompany).toHaveBeenCalledWith(COMPANY_ID)
		expect(result).toEqual(mockCompany)
	})

	it('listJobs delegates to jobRepository with options', async () => {
		infra.jobRepository.listJobs.mockResolvedValue([] as never)
		const options = { filters: [{ field: 'active', operator: '==' as const, value: true }] }

		await service.listJobs(COMPANY_ID, options)

		expect(infra.jobRepository.listJobs).toHaveBeenCalledWith(COMPANY_ID, options)
	})

	it('listCompanyInterviews delegates to candidateRepository', async () => {
		infra.candidateRepository.listCompanyInterviews.mockResolvedValue([] as never)

		await service.listCompanyInterviews(COMPANY_ID)

		expect(infra.candidateRepository.listCompanyInterviews).toHaveBeenCalledWith(COMPANY_ID, undefined)
	})

	it('listNps delegates to npsRepository', async () => {
		infra.npsRepository.listNps.mockResolvedValue([] as never)

		await service.listNps(COMPANY_ID)

		expect(infra.npsRepository.listNps).toHaveBeenCalledWith(COMPANY_ID, undefined)
	})

	it('listCollaborators delegates to collaboratorRepository', async () => {
		infra.collaboratorRepository.listCollaborators.mockResolvedValue([] as never)

		await service.listCollaborators(COMPANY_ID)

		expect(infra.collaboratorRepository.listCollaborators).toHaveBeenCalledWith(COMPANY_ID, undefined)
	})
})
