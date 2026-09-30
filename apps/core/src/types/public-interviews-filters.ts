import type { PublicInterview } from '@coploy/domain'
import type { InterviewTagsDocument } from './interview-tags'

export interface InterviewFilters {
	find?: string
	careerLevel: string
	country: string
	state: string
	city: string
	startDate?: string
	endDate?: string
	cursor?: string
	limit?: number
	/** Empresa logada — usado para cruzar com creditsUsed e marcar candidatos desbloqueados. */
	companyId?: string
	/** Quando true, retorna apenas candidatos já desbloqueados pela empresa logada. */
	unlockedOnly?: boolean
	hardSkillTag?: string
	hardSkillArea?: string
	minHardSkillPontuacao?: number
	hardSkillNivelEvidencia?: string
	senioridadeNivel?: string
	minConfiancaSenioridade?: number
	tipoEmpresaIdeal?: string
	porteEmpresa?: string
	minScoreGeral?: number
	/** Anos de experiência declarados no currículo do candidato. */
	minYearsExperience?: number
	// Campos opcionais para filtros de empresa
	headquartersCountries?: string[] | null
	evaluateInternationalCandidates?: boolean
}

export interface ProcessedInterview
	extends Omit<
		PublicInterview,
		'date' | 'job_applied_ref' | 'job_ref' | 'user_ref'
	> {
	date: Date
	job_applied_ref: string | null
	job_ref: string | null
	user_ref: string | null
	interview_tags: InterviewTagsDocument | null
}

export interface UniqueEmailInterview
	extends Omit<ProcessedInterview, 'interview_tags'> {
	totalInterviewsByEmail: number
	interview_tags: InterviewTagsDocument[]
	countryOfResidence?: string | null
	countriesOfInterest?: string[] | null
	/** Do currículo vivo (`candidateProfiles`), não do retrato da entrevista. */
	yearsOfExperience?: number | null
	declaredSkills?: string[] | null
	/** Currículo achatado em texto — existe só para a busca. */
	profileText?: string | null
}

export interface SearchContext {
	searchTerm: string
	isBasicMatch: boolean
	isInterviewTagsMatch: boolean
}

export interface InterviewSearchResult {
	interviews: UniqueEmailInterview[]
	total: number
}
