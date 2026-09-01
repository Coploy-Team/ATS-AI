
export interface Company {
	id: string
	companyName: string
}

export interface TemporaryReport {
	base64Excel: string
	createdAt: Date
	companyId: string
}

export interface FirestoreTimestamp {
	seconds: number
	nanoseconds: number
}

export interface Interview {
	id: string
	name: string
	email: string
	phone_number: string
	job_name: string
	job_description: string
	career_level: string
	candidate_status: string
	finishedTime: FirestoreTimestamp
	finished: boolean
	score: number
	date: FirestoreTimestamp
	external_id: string
	job_ref: { id: string; path?: string }
	job_applied_ref: { id: string; path?: string }
	user_ref: { id: string; path?: string }
	date_select: FirestoreTimestamp
	candidate_id?: string // Opcional - será extraído de user_ref.id
	identifier: string
}

export interface ProcessedInterview {
	codigoVaga: string
	dataRequisicao: Date | string
	linkDaVaga: string
	vaga: string
	statusVaga: string
	tipoVaga: string
	nomeCandidato: string
	nota: number | ''
	dataTeste: Date | string
	emailCandidato: string
	telefoneCandidato: string
	status: string
	dataSelecao: Date | string
	linkCandidato: string
}

export interface ExcelReportData {
	interviews: ProcessedInterview[]
	totalInterviews: number
	averageScore: number
	companyName: string
}

export interface ExcelReportFilters {
	find?: string
	status?: string
	dataRange?: string
	interviewCount?: string
	score?: number
	jobId?: string
	/**
	 * Vagas alcançadas pela sessão; ausente = todas.
	 *
	 * Não é filtro do cliente. O relatório é a porta mais perigosa da parede:
	 * o que sai daqui vira arquivo, sai do produto e não volta atrás. Um
	 * recrutador que não vê a vaga do colega na tela não pode baixá-la numa
	 * planilha.
	 */
	jobIdsInScope?: Set<string> | null
}

export interface ReportGenerationOptions {
	companyId: string
	temporaryUid: string
	includeStatistics?: boolean
	debugMode?: boolean
}
