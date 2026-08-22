export const INTERVIEW_ABANDONMENT_REASONS = [
	'technical_issue',
	'changed_mind',
	'too_long',
	'will_finish_later',
	'privacy_concern',
	'other',
] as const

export type InterviewAbandonmentReason =
	(typeof INTERVIEW_ABANDONMENT_REASONS)[number]

export interface InterviewAbandonment {
	id: string
	interviewId: string
	jobId: string
	companyId: string
	userId?: string | null
	reason: InterviewAbandonmentReason
	comment?: string | null
	questionIndex?: number | null
	createdAt: string
}
