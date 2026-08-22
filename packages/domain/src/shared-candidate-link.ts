export interface SharedCandidateLinkSections {
	score: boolean
	feedback: boolean
	analysis: boolean
	questions: boolean
}

export interface SharedCandidateLink {
	id: string
	code: string
	companyId: string
	jobId: string
	candidateIds: string[]
	sections: SharedCandidateLinkSections
	createdBy?: string | null
	createdAt?: Date | null
	expiresAt?: Date | null
	revoked?: boolean | null
}
