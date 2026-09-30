export interface AdminCandidateSummaryInterview {
	id: string
	companyId: string
	companyName: string | null
	userId: string | null
	jobAppliedId: string | null
	candidateName: string | null
	candidateEmail: string | null
	jobName: string | null
	jobId: string | null
	score: number | null
	status: string | null
	finished: boolean
	stopped: boolean
	date: Date | null
	typeInterview: string | null
	interviewMode: string | null
	questionsAnswered: number | null
	questionsTotal: number | null
}

export interface AdminCandidateSummary {
	id: string
	candidateKey: string
	name: string
	email: string | null
	userId: string | null
	companyId: string
	companyName: string | null
	jobName: string | null
	jobId: string | null
	totalInterviews: number
	finishedInterviews: number
	pendingInterviews: number
	erroredInterviews: number
	bestScore: number | null
	lastStatus: string | null
	lastFinished: boolean
	lastDate: Date | null
	lastInterviewId: string
	updatedAt: Date | null
	interviews: AdminCandidateSummaryInterview[]
	keywords: string[]
}
