import type { CreateInput, RejectionReviewRequest, UpdateInput } from '@coploy/domain'

export interface RejectionReviewRequestRepository {
	create(data: CreateInput<RejectionReviewRequest>): Promise<RejectionReviewRequest & { id: string }>
	findByJobAppliedId(jobAppliedId: string): Promise<(RejectionReviewRequest & { id: string }) | null>
	listPendingByCompany(
		companyId: string,
		options?: { limit?: number },
	): Promise<(RejectionReviewRequest & { id: string })[]>
	getById(id: string): Promise<(RejectionReviewRequest & { id: string }) | null>
	update(id: string, data: UpdateInput<RejectionReviewRequest>): Promise<void>
}
