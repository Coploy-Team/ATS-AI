import type { CompanyInterview, PostJob } from '@coploy/domain'

export interface JobFilters {
	find?: string
	status: string
	interviewType: string[]
	interviewMode?: 'video' | 'voice' | 'whatsapp'
	showArchived: boolean
	language: string
	segment: string
	level: string
	education: string
	country: string
	state: string
	city: string
	candidatesLimit: number
	cursor?: string // Cursor para paginação composto (priority|timeCreated ISO)
	creatorId?: string
	/**
	 * Alcance da SESSÃO (não é filtro do cliente).
	 *
	 * `own` = só as vagas criadas por `scopedToUserId`. Chega resolvido do
	 * servidor e sobrepõe qualquer `creatorId` que o cliente mande — senão a
	 * parede cairia com um parâmetro na URL.
	 */
	scope?: 'all' | 'own'
	scopedToUserId?: string | null
	priority?: 'all' | 'true' | 'false'
	sortBy?: 'default' | 'name' | 'createdAt'
	sortDir?: 'asc' | 'desc'
}

export interface ProcessedJob
	extends Omit<PostJob, 'uid' | 'timeCreated' | 'closingDate' | 'infoJobs'> {
	uid: string | null
	timeCreated: Date | null
	closingDate: Date | null
	infoJobs: string | null
	usersApplied: ProcessedInterview[]
	totalCandidates: number
	stageCounts: Record<string, number>
	stageDays: Record<string, number>
	/*
	 * Acompanha o domínio (`PostJob.creatorId`), que é anulável: vaga antiga
	 * não tem criador gravado. Estreitar aqui para `string` fazia a montagem do
	 * objeto não casar com o próprio tipo.
	 */
	creatorId?: string | null | null
	creatorName?: string | null
	creatorEmail?: string | null
}

export interface ProcessedInterview
	extends Omit<
		CompanyInterview,
		'date' | 'job_applied_ref' | 'user_ref' | 'job_ref' | 'dateSelect'
	> {
	date: Date | null
	job_applied_ref: string | null
	user_ref: string | null
	job_ref: string | null
	dateSelect: Date | null
	candidateStatus: string | null | undefined
}

export interface JobCandidatesResult {
	usersApplied: ProcessedInterview[]
	totalCandidates: number
	hasMoreCandidates: boolean
	/** Contagem de candidatos por etapa (candidateStatus normalizado) — agregada sobre TODOS, não só o slice do limit. */
	stageCounts: Record<string, number>
	/** Tempo MÉDIO parado em cada etapa, em dias (a "trilha" da vaga). */
	stageDays: Record<string, number>
}

export interface JobsWithInterviews {
	jobs: ProcessedJob[]
	interviews: CompanyInterview[]
	nextCursor: string | null // Cursor para próxima página
	lastJobDate?: Date | null // Data do último job processado
	/** Total real do filtro quando o provider consegue contar (Firestore); null = sem contagem. */
	totalFiltered?: number | null
}

export interface JobSearchResult {
	jobs: ProcessedJob[]
	nextCursor: string | null // Cursor para próxima página
	/** Total real do filtro quando o provider consegue contar (Firestore); null = sem contagem. */
	totalFiltered?: number | null
}
