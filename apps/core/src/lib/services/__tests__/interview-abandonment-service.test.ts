import { BadRequestError } from '@coploy/shared/errors'

import { createInterviewAbandonmentService } from '../interview-abandonment-service'
import { createMockInfra } from './mock-infra'

describe('createInterviewAbandonmentService', () => {
	let infra: ReturnType<typeof createMockInfra>
	let service: ReturnType<typeof createInterviewAbandonmentService>

	beforeEach(() => {
		infra = createMockInfra()
		service = createInterviewAbandonmentService(infra)
		infra.interviewAbandonmentRepository.create.mockImplementation(async (data) => ({
			id: 'abandonment-1',
			...data,
		}))
	})

	it('creates an abandonment with a valid reason', async () => {
		const result = await service.create({
			interviewId: 'interview-1',
			jobId: 'job-1',
			companyId: 'company-1',
			reason: 'technical_issue',
		})

		expect(infra.interviewAbandonmentRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				interviewId: 'interview-1',
				jobId: 'job-1',
				companyId: 'company-1',
				userId: null,
				reason: 'technical_issue',
				comment: null,
				questionIndex: null,
			}),
		)
		expect(typeof result.createdAt).toBe('string')
		expect(result.id).toBe('abandonment-1')
	})

	it('rejects an invalid reason', async () => {
		const invalidInput = {
			interviewId: 'interview-1',
			jobId: 'job-1',
			companyId: 'company-1',
			reason: 'invalid_reason',
		} as unknown as Parameters<typeof service.create>[0]

		await expect(
			service.create(invalidInput),
		).rejects.toBeInstanceOf(BadRequestError)
		expect(infra.interviewAbandonmentRepository.create).not.toHaveBeenCalled()
	})

	it('stores optional comment and question index', async () => {
		await service.create({
			interviewId: 'interview-1',
			jobId: 'job-1',
			companyId: 'company-1',
			reason: 'too_long',
			comment: '  Too many questions  ',
			questionIndex: 4,
		})

		expect(infra.interviewAbandonmentRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				comment: 'Too many questions',
				questionIndex: 4,
			}),
		)
	})

	it('stores userId when present', async () => {
		const created = await service.create({
			interviewId: 'interview-1',
			jobId: 'job-1',
			companyId: 'company-1',
			userId: 'candidate-1',
			reason: 'privacy_concern',
		})

		expect(created.userId).toBe('candidate-1')
		expect(infra.interviewAbandonmentRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'candidate-1',
			}),
		)
	})
})
