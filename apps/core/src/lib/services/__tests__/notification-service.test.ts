import { createNotificationService } from '../notification-service'
import { createMockInfra } from './mock-infra'

describe('createNotificationService', () => {
	const COMPANY_ID = 'company-notif'
	const NOTIF_ID = 'notif-001'
	const MSG_ID = 'msg-001'
	const USER_ID = 'user-001'
	const JOB_APPLIED_ID = 'ja-001'
	const JOB_ID = 'job-001'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createNotificationService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createNotificationService(infra)
	})

	// ─── Simple delegates ────────────────────────────────────────────────────

	it('listCompanyNotifications delegates to notificationRepository', async () => {
		infra.notificationRepository.listCompanyNotifications.mockResolvedValue([] as never)
		await service.listCompanyNotifications(COMPANY_ID)
		expect(infra.notificationRepository.listCompanyNotifications).toHaveBeenCalledWith(COMPANY_ID, undefined)
	})

	it('createCompanyNotification delegates to notificationRepository', async () => {
		infra.notificationRepository.createCompanyNotification.mockResolvedValue({ id: NOTIF_ID } as never)
		await service.createCompanyNotification(COMPANY_ID, { title: 'Test' })
		expect(infra.notificationRepository.createCompanyNotification).toHaveBeenCalledWith(COMPANY_ID, { title: 'Test' })
	})

	it('updateCompanyNotification delegates to notificationRepository', async () => {
		infra.notificationRepository.updateCompanyNotification.mockResolvedValue(undefined)
		await service.updateCompanyNotification(COMPANY_ID, NOTIF_ID, { read: true })
		expect(infra.notificationRepository.updateCompanyNotification).toHaveBeenCalledWith(COMPANY_ID, NOTIF_ID, { read: true })
	})

	it('deleteCompanyNotification delegates to notificationRepository', async () => {
		infra.notificationRepository.deleteCompanyNotification.mockResolvedValue(undefined)
		await service.deleteCompanyNotification(COMPANY_ID, NOTIF_ID)
		expect(infra.notificationRepository.deleteCompanyNotification).toHaveBeenCalledWith(COMPANY_ID, NOTIF_ID)
	})

	it('listNotificationMessages delegates to notificationRepository', async () => {
		infra.notificationRepository.listNotificationMessages.mockResolvedValue([] as never)
		await service.listNotificationMessages(COMPANY_ID)
		expect(infra.notificationRepository.listNotificationMessages).toHaveBeenCalledWith(COMPANY_ID, undefined)
	})

	it('createNotificationMessage delegates to notificationRepository', async () => {
		infra.notificationRepository.createNotificationMessage.mockResolvedValue({ id: MSG_ID } as never)
		await service.createNotificationMessage(COMPANY_ID, { body: 'hello' })
		expect(infra.notificationRepository.createNotificationMessage).toHaveBeenCalledWith(COMPANY_ID, { body: 'hello' })
	})

	// ─── extractJobIdFromActionRef ───────────────────────────────────────────

	describe('extractJobIdFromActionRef', () => {
		it('returns null for undefined actionRef', async () => {
			const result = await service.extractJobIdFromActionRef(undefined)
			expect(result).toBeNull()
			expect(infra.candidateRepository.getJobApplied).not.toHaveBeenCalled()
		})

		it('returns null when jobApplied document not found', async () => {
			infra.candidateRepository.getJobApplied.mockResolvedValue(null)
			const result = await service.extractJobIdFromActionRef(
				`users/${USER_ID}/jobsApplied/${JOB_APPLIED_ID}`,
			)
			expect(result).toBeNull()
		})

		it('extracts job id from valid users/uid/jobsApplied/jaId path', async () => {
			infra.candidateRepository.getJobApplied.mockResolvedValue({
				id: JOB_APPLIED_ID,
				jobApplied: { path: `companies/comp/jobs/${JOB_ID}`, id: JOB_ID },
			} as never)

			const result = await service.extractJobIdFromActionRef(
				`users/${USER_ID}/jobsApplied/${JOB_APPLIED_ID}`,
			)

			expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith(USER_ID, JOB_APPLIED_ID)
			expect(result).toBe(JOB_ID)
		})

		it('returns null when jobApplied has no path', async () => {
			infra.candidateRepository.getJobApplied.mockResolvedValue({
				id: JOB_APPLIED_ID,
				jobApplied: {},
			} as never)

			const result = await service.extractJobIdFromActionRef(
				`users/${USER_ID}/jobsApplied/${JOB_APPLIED_ID}`,
			)
			expect(result).toBeNull()
		})

		it('returns null when getJobApplied throws', async () => {
			infra.candidateRepository.getJobApplied.mockRejectedValue(new Error('db error'))

			const result = await service.extractJobIdFromActionRef(
				`users/${USER_ID}/jobsApplied/${JOB_APPLIED_ID}`,
			)
			expect(result).toBeNull()
		})
	})
})
