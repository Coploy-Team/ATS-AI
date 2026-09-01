import type { CompanyInterview, JobApplied, RejectionReviewRequest, RejectionReviewStatus, UpdateInput } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError, NotFoundError } from '@coploy/shared/errors'

import { createOutboxWriter } from '@/lib/events/outbox-writer'

const REVIEW_WINDOW_DAYS = 90
const REVIEW_WINDOW_MS = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
const OVERTURNED_ACTIVE_STATUS = 'pending'
const AUTOMATED_REVIEW_ONLY_MESSAGE = 'Review is available only for automated knockout rejections'

export type CandidateRejectionReviewRequest = Omit<
	RejectionReviewRequest,
	'reviewerNote' | 'reviewedByUserId'
>

function refId(ref: JobApplied['jobApplied']): string | null {
	return ref?.id ?? null
}

function isRejected(status: string | null | undefined): boolean {
	return typeof status === 'string' && status.trim().toLowerCase() === 'rejected'
}

function rejectionDate(application: JobApplied): Date | null {
	return application.dateSelect
		?? application.screeningKnockoutResult?.evaluatedAt
		?? application.rejectionFeedbackSentAt
		?? null
}

function sanitizeForCandidate(
	request: RejectionReviewRequest & { id: string },
): CandidateRejectionReviewRequest {
	const {
		reviewerNote: _reviewerNote,
		reviewedByUserId: _reviewedByUserId,
		...safe
	} = request
	return safe
}

function normalizeMessage(message: string | null | undefined): string | null {
	const trimmed = message?.trim()
	return trimmed ? trimmed : null
}

function buildOverturnedApplicationUpdate(now: Date): Record<string, unknown> {
	return {
		candidateStatus: OVERTURNED_ACTIVE_STATUS,
		candidate_status: OVERTURNED_ACTIVE_STATUS,
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
		updated_at: now.toISOString(),
	}
}

function assertSameApplication(application: JobApplied, companyId: string, jobId: string): void {
	const applicationJobId = refId(application.jobApplied)
	const applicationCompanyId = application.companyOwner?.id ?? null
	if (applicationJobId && applicationJobId !== jobId) {
		throw new BadRequestError('Application does not belong to this job')
	}
	if (applicationCompanyId && applicationCompanyId !== companyId) {
		throw new BadRequestError('Application does not belong to this company')
	}
}

function assertReviewEligible(application: JobApplied): void {
	if (!isRejected(application.candidateStatus)) {
		throw new BadRequestError('Review is available only for rejected applications')
	}
	if (application.rejectionDecisionSource !== 'knockout') {
		throw new BadRequestError(AUTOMATED_REVIEW_ONLY_MESSAGE)
	}
}

async function overturnApplicationRejection(
	infra: InfraProvider,
	request: RejectionReviewRequest,
	reviewedAt: Date,
): Promise<void> {
	const update = buildOverturnedApplicationUpdate(reviewedAt)

	await infra.candidateRepository.updateJobApplied(
		request.candidateUserId,
		request.jobAppliedId,
		update as UpdateInput<JobApplied>,
	)

	const jobInterview = await infra.candidateRepository.getJobInterview(
		request.companyId,
		request.jobId,
		request.jobAppliedId,
	)
	if (jobInterview) {
		await infra.candidateRepository.updateJobInterview(
			request.companyId,
			request.jobId,
			request.jobAppliedId,
			update as UpdateInput<JobApplied>,
		)
	}

	const companyInterview = await infra.candidateRepository.getCompanyInterview(
		request.companyId,
		request.jobAppliedId,
	)
	if (companyInterview) {
		await infra.candidateRepository.updateCompanyInterview(
			request.companyId,
			companyInterview.id,
			update as UpdateInput<CompanyInterview>,
		)
	}
}

async function writeReviewEvent(
	infra: InfraProvider,
	event: Parameters<ReturnType<typeof createOutboxWriter>['write']>[0],
): Promise<void> {
	try {
		await createOutboxWriter(infra).write(event)
	} catch (error) {
		console.error('[RejectionReview] failed to write event:', error)
	}
}

export function createRejectionReviewService(infra: InfraProvider) {
	const repository = infra.rejectionReviewRequestRepository

	return {
		async requestReview(params: {
			companyId: string
			jobId: string
			jobAppliedId: string
			candidateUserId: string
			candidateMessage?: string | null
		}): Promise<CandidateRejectionReviewRequest> {
			const { companyId, jobId, jobAppliedId, candidateUserId } = params
			if (!companyId) throw new BadRequestError('companyId is required')
			if (!jobId) throw new BadRequestError('jobId is required')
			if (!jobAppliedId) throw new BadRequestError('jobAppliedId is required')
			if (!candidateUserId) throw new BadRequestError('candidateUserId is required')

			const existing = await repository.findByJobAppliedId(jobAppliedId)
			if (existing) return sanitizeForCandidate(existing)

			const application = await infra.candidateRepository.getJobApplied(candidateUserId, jobAppliedId)
			if (!application) throw new NotFoundError('Application not found')
			assertSameApplication(application, companyId, jobId)
			assertReviewEligible(application)

			const rejectedAt = rejectionDate(application)
			if (!rejectedAt) throw new BadRequestError('Rejection date is not available')
			const now = new Date()
			if (now.getTime() - rejectedAt.getTime() > REVIEW_WINDOW_MS) {
				throw new BadRequestError('Review request window has expired')
			}

			const created = await repository.create({
				companyId,
				jobId,
				jobAppliedId,
				candidateUserId,
				status: 'pending',
				requestedAt: now,
				candidateMessage: normalizeMessage(params.candidateMessage),
				reviewedByUserId: null,
				reviewedAt: null,
				reviewerNote: null,
				outcomeMessage: null,
			})

			await writeReviewEvent(infra, {
				type: 'rejection_review_requested',
				companyId,
				payload: {
					requestId: created.id,
					applicationId: jobAppliedId,
					jobId,
					candidateId: candidateUserId,
					occurredAt: now.toISOString(),
				},
			})

			return sanitizeForCandidate(created)
		},

		async getCandidateReview(params: {
			companyId: string
			jobId: string
			jobAppliedId: string
			candidateUserId: string
		}): Promise<CandidateRejectionReviewRequest | null> {
			const { companyId, jobId, jobAppliedId, candidateUserId } = params
			if (!companyId) throw new BadRequestError('companyId is required')
			if (!jobId) throw new BadRequestError('jobId is required')
			if (!jobAppliedId) throw new BadRequestError('jobAppliedId is required')
			if (!candidateUserId) throw new BadRequestError('candidateUserId is required')

			const application = await infra.candidateRepository.getJobApplied(candidateUserId, jobAppliedId)
			if (!application) throw new NotFoundError('Application not found')
			assertSameApplication(application, companyId, jobId)

			const existing = await repository.findByJobAppliedId(jobAppliedId)
			if (!existing) {
				assertReviewEligible(application)
				return null
			}
			if (existing.candidateUserId !== candidateUserId) {
				throw new NotFoundError('Review request not found')
			}

			return sanitizeForCandidate(existing)
		},

		async listPending(params: {
			companyId: string
			limit?: number
		}): Promise<(RejectionReviewRequest & { id: string })[]> {
			if (!params.companyId) throw new BadRequestError('companyId is required')
			return repository.listPendingByCompany(params.companyId, {
				limit: params.limit,
			})
		},

		async respond(params: {
			companyId: string
			requestId: string
			status: Exclude<RejectionReviewStatus, 'pending'>
			reviewedByUserId: string
			reviewerNote?: string | null
			outcomeMessage?: string | null
		}): Promise<RejectionReviewRequest & { id: string }> {
			const { companyId, requestId, status, reviewedByUserId } = params
			if (!companyId) throw new BadRequestError('companyId is required')
			if (!requestId) throw new BadRequestError('requestId is required')
			if (!reviewedByUserId) throw new BadRequestError('reviewedByUserId is required')

			const request = await repository.getById(requestId)
			if (!request) throw new NotFoundError('Review request not found')
			if (request.companyId !== companyId) {
				throw new BadRequestError('Review request does not belong to this company')
			}
			if (request.status !== 'pending') {
				throw new BadRequestError('Review request has already been resolved')
			}

			const reviewedAt = new Date()
			const update = {
				status,
				reviewedByUserId,
				reviewedAt,
				reviewerNote: normalizeMessage(params.reviewerNote),
				outcomeMessage: normalizeMessage(params.outcomeMessage),
			}
			await repository.update(requestId, update)

			if (status === 'overturned') {
				await overturnApplicationRejection(infra, request, reviewedAt)
			}

			await writeReviewEvent(infra, {
				type: 'rejection_review_resolved',
				companyId,
				payload: {
					requestId,
					applicationId: request.jobAppliedId,
					jobId: request.jobId,
					status,
					reviewedByUserId,
					occurredAt: reviewedAt.toISOString(),
				},
			})

			return {
				...request,
				...update,
			}
		},
	}
}

export type RejectionReviewService = ReturnType<typeof createRejectionReviewService>
