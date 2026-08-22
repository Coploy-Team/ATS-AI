export interface CandidateRankingInterview {
	id: string
	dateTime?: string | null
	score?: string | number | null
	job?: string | null
	info?: Record<string, unknown>[]
	additional?: Record<string, unknown>[]
	masked?: boolean
}

export interface CandidateRankingJobApplied {
	id: string
	appliedTime?: string | null
	companyOwner?: string | null
	userApplied?: string | null
	jobApplied?: string | null
	finished?: boolean | null
	candidateStatus?: string | null
	typeInterview?: string | null
	batchProcessing?: {
		status?: string | null
		engineBatchId?: string | null
		queuedAt?: string | null
		completedAt?: string | null
		error?: string | null
	} | null
	interview?: CandidateRankingInterview | null
	whatsappTriagemResult?: Record<string, unknown> | null
}

export interface ScorableInterviewRef {
	userRefId: string
	jobAppliedId: string
	score: number
	/** Data da entrevista — usada para avaliar a janela de cortesia SaaS
	 * (`company.subscriptionTrial.startAt`). */
	date: Date | null
}

export interface Candidate {
	name: string
	email: string
	photo_url: string
	interviews: number
	averageScore: number | null
	lastInterview: Date | null
	status: string | null
	userId: string | null
	jobsApplied?: CandidateRankingJobApplied[]
	validInterviewsCount?: number // Contador de entrevistas válidas para cálculo de média
	// Coletado durante ingestão p/ aplicar mask de score do SaaS sem refetch.
	scorableInterviews?: ScorableInterviewRef[]
	// Sinaliza ao frontend que o averageScore foi ocultado (todas as entrevistas escondidas).
	masked?: boolean
	// ✅ NOVOS CAMPOS DO USUÁRIO
	phone_number?: string | null
	occupation?: string | null
	level?: string | null
	city?: string | null
	state?: string | null
	academic?: string | null
	professional_experience?: string | null
	professionalObjectives?: string | null
	resumeUrl?: string | null
	language?: string | null
	countryOfResidence?: string | null
	countriesOfInterest?: string[]
	created_time?: Date | null
	external_id?: string | null
	finished?: boolean
	dreamJobsInterview?: any | null
	paymentDetails?: any | null
	pdf_socioEmotional?: string | null
	testing?: boolean
}

export interface CandidateFilters {
	status: string
	dataRange: string
	interviewCount: string
	score?: number
	find?: string
	cursor?: string // Cursor para paginação (timestamp ISO)
	jobId?: string // Filtra candidatos que se aplicaram a esta vaga
}

export interface CandidateFiltersWithDateLimit extends CandidateFilters {
	dateLimit: Date
}

export interface CandidateSearchResult {
	candidates: Candidate[]
	hasMore: boolean
	totalProcessed: number
	nextCursor: string | null // Cursor para próxima página
	lastInterviewDate?: Date | null // Data da última entrevista processada
	// Quando presente (SaaS não-enterprise), describe quais (userId, jobAppliedId)
	// têm score visível por crédito + a janela de cortesia SaaS da empresa
	// do viewer (data < subscriptionTrial.startAt).
	maskContext?: {
		paidKeys: Set<string>
		subscriptionTrialStartAt: Date | null
	} | null
}
