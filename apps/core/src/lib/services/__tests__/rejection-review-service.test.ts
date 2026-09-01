import type { JobApplied, RejectionReviewRequest } from '@coploy/domain'

import { createRejectionReviewService } from '../rejection-review-service'
import { createMockInfra } from './mock-infra'

function application(overrides: Partial<JobApplied> = {}): JobApplied {
	return {
		id: 'app-1',
		candidateStatus: 'Rejected',
		rejectionDecisionSource: 'knockout',
		dateSelect: new Date('2026-08-01T12:00:00.000Z'),
		companyOwner: { id: 'company-1' },
		jobApplied: { id: 'job-1' },
		...overrides,
	}
}

function review(overrides: Partial<RejectionReviewRequest> = {}): RejectionReviewRequest & { id: string } {
	return {
		id: 'review-1',
		companyId: 'company-1',
		jobId: 'job-1',
		jobAppliedId: 'app-1',
		candidateUserId: 'candidate-1',
		status: 'pending',
		requestedAt: new Date('2026-08-02T12:00:00.000Z'),
		candidateMessage: null,
		reviewedByUserId: null,
		reviewedAt: null,
		reviewerNote: null,
		outcomeMessage: null,
		...overrides,
	}
}

describe('createRejectionReviewService', () => {
	beforeEach(() => {
		jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'))
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('rejects review requests for manual or bulk rejections', async () => {
		for (const source of ['manual', 'bulk'] as const) {
			const infra = createMockInfra()
			infra.rejectionReviewRequestRepository.findByJobAppliedId.mockResolvedValue(null)
			infra.candidateRepository.getJobApplied.mockResolvedValue(application({
				rejectionDecisionSource: source,
			}))

			await expect(createRejectionReviewService(infra).requestReview({
				companyId: 'company-1',
				jobId: 'job-1',
				jobAppliedId: 'app-1',
				candidateUserId: 'candidate-1',
			})).rejects.toThrow('automated knockout')

			expect(infra.rejectionReviewRequestRepository.create).not.toHaveBeenCalled()
		}
	})

	it('returns the existing review request when called again for the same application', async () => {
		const infra = createMockInfra()
		infra.rejectionReviewRequestRepository.findByJobAppliedId.mockResolvedValue(review({
			reviewerNote: 'internal note',
		}))

		const result = await createRejectionReviewService(infra).requestReview({
			companyId: 'company-1',
			jobId: 'job-1',
			jobAppliedId: 'app-1',
			candidateUserId: 'candidate-1',
		})

		expect(result.id).toBe('review-1')
		expect(result).not.toHaveProperty('reviewerNote')
		expect(infra.candidateRepository.getJobApplied).not.toHaveBeenCalled()
		expect(infra.rejectionReviewRequestRepository.create).not.toHaveBeenCalled()
	})

	it('lets the candidate fetch an existing review request without exposing internal fields', async () => {
		const infra = createMockInfra()
		infra.candidateRepository.getJobApplied.mockResolvedValue(application())
		infra.rejectionReviewRequestRepository.findByJobAppliedId.mockResolvedValue(review({
			reviewerNote: 'internal note',
			reviewedByUserId: 'recruiter-1',
		}))

		const result = await createRejectionReviewService(infra).getCandidateReview({
			companyId: 'company-1',
			jobId: 'job-1',
			jobAppliedId: 'app-1',
			candidateUserId: 'candidate-1',
		})

		expect(result?.id).toBe('review-1')
		expect(result).not.toHaveProperty('reviewerNote')
		expect(result).not.toHaveProperty('reviewedByUserId')
		expect(infra.candidateRepository.getJobApplied).toHaveBeenCalledWith('candidate-1', 'app-1')
	})

	it('returns null when the candidate has no review request yet', async () => {
		const infra = createMockInfra()
		infra.candidateRepository.getJobApplied.mockResolvedValue(application())
		infra.rejectionReviewRequestRepository.findByJobAppliedId.mockResolvedValue(null)

		const result = await createRejectionReviewService(infra).getCandidateReview({
			companyId: 'company-1',
			jobId: 'job-1',
			jobAppliedId: 'app-1',
			candidateUserId: 'candidate-1',
		})

		expect(result).toBeNull()
	})

	it('signals that review is unavailable when fetching a human rejection with no request', async () => {
		const infra = createMockInfra()
		infra.candidateRepository.getJobApplied.mockResolvedValue(application({
			rejectionDecisionSource: 'manual',
		}))
		infra.rejectionReviewRequestRepository.findByJobAppliedId.mockResolvedValue(null)

		await expect(createRejectionReviewService(infra).getCandidateReview({
			companyId: 'company-1',
			jobId: 'job-1',
			jobAppliedId: 'app-1',
			candidateUserId: 'candidate-1',
		})).rejects.toThrow('automated knockout')
	})

	it('blocks candidate requests outside the 90 day window', async () => {
		const infra = createMockInfra()
		infra.rejectionReviewRequestRepository.findByJobAppliedId.mockResolvedValue(null)
		infra.candidateRepository.getJobApplied.mockResolvedValue(application({
			dateSelect: new Date('2026-04-01T12:00:00.000Z'),
		}))

		await expect(createRejectionReviewService(infra).requestReview({
			companyId: 'company-1',
			jobId: 'job-1',
			jobAppliedId: 'app-1',
			candidateUserId: 'candidate-1',
		})).rejects.toThrow('window has expired')

		expect(infra.rejectionReviewRequestRepository.create).not.toHaveBeenCalled()
	})

	it('records reviewer identity and review timestamp when recruiter responds', async () => {
		const infra = createMockInfra()
		infra.rejectionReviewRequestRepository.getById.mockResolvedValue(review())

		const result = await createRejectionReviewService(infra).respond({
			companyId: 'company-1',
			requestId: 'review-1',
			status: 'upheld',
			reviewedByUserId: 'recruiter-1',
			reviewerNote: 'checked manually',
		})

		expect(result.status).toBe('upheld')
		expect(result.reviewedByUserId).toBe('recruiter-1')
		expect(result.reviewedAt).toBeInstanceOf(Date)
		expect(infra.rejectionReviewRequestRepository.update).toHaveBeenCalledWith(
			'review-1',
			expect.objectContaining({
				status: 'upheld',
				reviewedByUserId: 'recruiter-1',
				reviewerNote: 'checked manually',
			}),
		)
	})

	it('does not alter the application when recruiter upholds the rejection', async () => {
		const infra = createMockInfra()
		infra.rejectionReviewRequestRepository.getById.mockResolvedValue(review())

		await createRejectionReviewService(infra).respond({
			companyId: 'company-1',
			requestId: 'review-1',
			status: 'upheld',
			reviewedByUserId: 'recruiter-1',
		})

		expect(infra.candidateRepository.updateJobApplied).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateJobInterview).not.toHaveBeenCalled()
		expect(infra.candidateRepository.updateCompanyInterview).not.toHaveBeenCalled()
	})

	it('overturns knockout rejection by returning the application to pending and clearing rejection fields', async () => {
		const infra = createMockInfra()
		infra.rejectionReviewRequestRepository.getById.mockResolvedValue(review())
		infra.candidateRepository.getJobInterview.mockResolvedValue(application() as never)
		infra.candidateRepository.getCompanyInterview.mockResolvedValue({
			...application(),
			id: 'company-interview-1',
		} as never)

		await createRejectionReviewService(infra).respond({
			companyId: 'company-1',
			requestId: 'review-1',
			status: 'overturned',
			reviewedByUserId: 'recruiter-1',
		})

		const clearedRejectionFields = expect.objectContaining({
			candidateStatus: 'pending',
			candidate_status: 'pending',
			dateSelect: null,
			date_select: null,
			rejectionReasonCode: null,
			rejectionReasonLabel: null,
			rejectionNote: null,
			rejectionFeedbackSentAt: null,
			rejectionDecisionSource: null,
			rejectionDecidedByUserId: null,
			rejectionTaxonomyVersion: null,
			rejectionEvidence: null,
			rejectionRiskFlags: null,
		})

		expect(infra.candidateRepository.updateJobApplied).toHaveBeenCalledWith(
			'candidate-1',
			'app-1',
			clearedRejectionFields,
		)
		expect(infra.candidateRepository.updateJobInterview).toHaveBeenCalledWith(
			'company-1',
			'job-1',
			'app-1',
			clearedRejectionFields,
		)
		expect(infra.candidateRepository.updateCompanyInterview).toHaveBeenCalledWith(
			'company-1',
			'company-interview-1',
			clearedRejectionFields,
		)
	})

	it('does not expose rejectionNote or reviewerNote in candidate responses', async () => {
		const infra = createMockInfra()
		infra.rejectionReviewRequestRepository.findByJobAppliedId.mockResolvedValue(null)
		infra.candidateRepository.getJobApplied.mockResolvedValue(application({
			rejectionNote: 'private rejection note',
		}))
		infra.rejectionReviewRequestRepository.create.mockImplementation(async (data) => review({
			...data,
			reviewerNote: 'private reviewer note',
		}))

		const result = await createRejectionReviewService(infra).requestReview({
			companyId: 'company-1',
			jobId: 'job-1',
			jobAppliedId: 'app-1',
			candidateUserId: 'candidate-1',
			candidateMessage: 'please review',
		})

		expect(result).not.toHaveProperty('rejectionNote')
		expect(result).not.toHaveProperty('reviewerNote')
		expect(result).not.toHaveProperty('reviewedByUserId')
	})
})
