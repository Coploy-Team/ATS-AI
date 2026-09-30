import type { EntityRef } from './common'

export interface StructuredJobRequirement {
	id: string
	label: string
	skill?: string
	weight: number
	required: boolean
}

export type ScreeningKnockoutQuestionType = 'boolean' | 'single-choice' | 'number'
export type ScreeningKnockoutRuleOperator =
	| 'equals'
	| 'not_equals'
	| 'greater_than'
	| 'greater_than_or_equal'
	| 'less_than'
	| 'less_than_or_equal'
	| 'in'
	| 'not_in'

export type ScreeningKnockoutRuleValue =
	| string
	| number
	| boolean
	| string[]
	| number[]
	| boolean[]
	| null

export interface ScreeningKnockoutRule {
	operator: ScreeningKnockoutRuleOperator
	value: ScreeningKnockoutRuleValue
}

export interface ScreeningKnockoutNode {
	id: string
	question: string
	type: ScreeningKnockoutQuestionType
	options?: string[] | null
	rule: ScreeningKnockoutRule
	onFail: 'knockout' | 'flag'
	weight?: number | null
}

export interface ScreeningKnockoutTree {
	version: number
	nodes: ScreeningKnockoutNode[]
}

export interface PostJob {
	id: string
	jobId?: string | null
	jobName?: string | null
	identifier?: string | null
	jobDescription?: string | null
	employmentType?: string | null
	carrerLevel?: string | null
	language?: string | null
	typeInterview?: string | null
	jobResponsabilities?: string | null
	jobResponsibilities?: string | null
	jobRequirements?: string | null
	structuredRequirements?: StructuredJobRequirement[] | null
	knockoutTree?: ScreeningKnockoutTree | null
	jobCategories?: string | null
	jobModel?: string | null
	jobHours?: string | null
	companyName?: string | null
	creatorId?: string | null
	creatorName?: string | null
	creatorEmail?: string | null
	contractType?: string | null
	screeningObjective?: string | null
	workModality?: string | null
	mainSkills?: string | null
	generatedJobDescription?: string | null
	limitNumberJobVacancies?: string | null
	stopped?: boolean | null
	archived?: boolean | null
	public?: boolean | null
	priority?: boolean | null
	limitedJobVacancy?: boolean | null
	infoJobsBool?: boolean | null
	requiresPreviousExperience?: boolean | null
	minimumAge?: number | null
	timeCreated?: Date | null
	closingDate?: Date | null
	educationalRequiements?: string[] | null
	address?: {
		state?: string | null
		country?: string | null
		city?: string | null
	} | null
	jobDescriptionMetadata?: {
		companyDescription?: string | null
		contractType?: string | null
		benefits?: string | null
		salary?: string | null
		generatedAt?: Date | null
		generatedBy?: string | null
	} | null
	/** Creator user-company reference. */
	uid?: EntityRef | null
	/** InfoJobs reference. */
	infoJobs?: EntityRef | null
	/** Notification message reference. */
	uid_notification_message?: EntityRef | null
	usersApplied?: EntityRef[] | null
	jobQuestions?: Array<{
		id?: string
		question?: string | null
		audioUrl?: string | null
		level?: string | null
		peso?: number | null
		skills?: string | null
		finish?: boolean | null
	}> | null
	additionalQuestions?: Array<{
		id?: string
		question?: string | null
		audioUrl?: string | null
		level?: string | null
		peso?: number | null
		skills?: string | null
		finish?: boolean | null
	}> | null
	/** AI evaluation / scoring data */
	evaluation?: Record<string, unknown> | null
	/** Critical competencies for the role */
	competencias_criticas?: string | null
	/** Additional competencies for the role */
	competencias_adicionais?: string | null
	/** Role expectations */
	expectativas?: string | null
}

export interface InfoJob {
	id: string
	name?: string | null
	finishText?: string | null
	finishVideo?: string | null
	welcomeText?: string | null
	welcomeVideo?: string | null
}

export interface JobPortal {
	id: string
	company_id?: string | null
	bannerUrl?: string | null
	defaultDomainUrl?: string | null
	logoUrl?: string | null
	primaryColor?: string | null
	textColor?: string | null
	isProfileVisible?: boolean | null
}

export interface InterviewWhatsapp {
	id: string
	jobId?: string | null
	companyId?: string | null
	typeInterview?: string | null
}
