export const CandidateStatus = {
	ALL: 'all',
	APPROVED: 'Approved',
	REJECTED: 'Rejected',
	SELECTED: 'Selected',
	PENDING: 'Pending',
} as const

export const DataRange = {
	ALL: 'all',
	LAST_WEEK: 'lastWeek',
	LAST_MONTH: 'lastMonth',
	LAST_3_MONTHS: 'last3Months',
} as const

export const InterviewCount = {
	ALL: 'all',
	AT_LEAST_ONE: 'atLeastOne',
	MORE_THAN_ONE: 'moreThanOne',
} as const

export type CandidateStatusType =
	(typeof CandidateStatus)[keyof typeof CandidateStatus]
export type DataRangeType = (typeof DataRange)[keyof typeof DataRange]
export type InterviewCountType =
	(typeof InterviewCount)[keyof typeof InterviewCount]
