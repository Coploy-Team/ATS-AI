import { createConversationService } from '../conversation-service'
import { createMockInfra } from './mock-infra'

describe('createConversationService', () => {
	const PHONE = '+5511999999999'
	const JOB_ID = 'job-001'
	const COMPANY_ID = 'company-001'

	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createConversationService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createConversationService(infra)
	})

	it('getConversationContext delegates to conversationRepository', async () => {
		const ctx = { id: 'ctx-1', phone: PHONE, jobId: JOB_ID }
		infra.conversationRepository.getConversationContext.mockResolvedValue(ctx as never)

		const result = await service.getConversationContext(PHONE, JOB_ID)

		expect(infra.conversationRepository.getConversationContext).toHaveBeenCalledWith(PHONE, JOB_ID)
		expect(result).toEqual(ctx)
	})

	it('createConversationContext delegates to conversationRepository', async () => {
		const data = { step: 1, answers: [] }
		infra.conversationRepository.createConversationContext.mockResolvedValue({ id: 'ctx-1', ...data } as never)

		await service.createConversationContext(PHONE, JOB_ID, data)

		expect(infra.conversationRepository.createConversationContext).toHaveBeenCalledWith(PHONE, JOB_ID, data)
	})

	it('updateConversationContext delegates to conversationRepository', async () => {
		infra.conversationRepository.updateConversationContext.mockResolvedValue(undefined)

		await service.updateConversationContext(PHONE, JOB_ID, { step: 2 })

		expect(infra.conversationRepository.updateConversationContext).toHaveBeenCalledWith(PHONE, JOB_ID, { step: 2 })
	})

	it('listConversationContexts delegates with options', async () => {
		infra.conversationRepository.listConversationContexts.mockResolvedValue([])
		const options = { filters: [{ field: 'step', operator: '==' as const, value: 1 }] }

		await service.listConversationContexts(PHONE, options)

		expect(infra.conversationRepository.listConversationContexts).toHaveBeenCalledWith(PHONE, options)
	})

	it('getJob delegates to jobRepository', async () => {
		const mockJob = { id: JOB_ID, title: 'Dev' }
		infra.jobRepository.getJob.mockResolvedValue(mockJob as never)

		const result = await service.getJob(COMPANY_ID, JOB_ID)

		expect(infra.jobRepository.getJob).toHaveBeenCalledWith(COMPANY_ID, JOB_ID)
		expect(result).toEqual(mockJob)
	})
})
