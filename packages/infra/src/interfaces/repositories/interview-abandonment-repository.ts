import type { CreateInput, InterviewAbandonment } from '@coploy/domain'

export interface InterviewAbandonmentRepository {
	create(
		data: CreateInput<InterviewAbandonment>,
	): Promise<InterviewAbandonment & { id: string }>
	list(options: { limit?: number }): Promise<(InterviewAbandonment & { id: string })[]>
}
