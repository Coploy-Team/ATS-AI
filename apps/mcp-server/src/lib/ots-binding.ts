/**
 * Mapeadores do binding REST OTS 0.1 .
 *
 * O wire do binding é o SCHEMA do artefato, não o shape interno dos services
 * — por isso todo recurso passa por um mapeador de allowlist explícita: campo
 * novo no service NÃO aparece no binding até alguém decidir (via mudança no
 * schema normativo + regeneração do openapi). É o mesmo raciocínio que
 * impediu os vazamentos do ADR-006 de voltarem.
 */
import type { CandidateInterviewSummary, CandidateProfile, MyProcessFeedback, MySchedule } from './core-client'
import type { PublicJobDetails, PublicJobSummary } from './services/public-jobs-service'

export interface OtsJob {
	jobId: string
	companyId: string
	title: string
	companyName: string | null
	companyLogo: string | null
	location: string | null
	workModality: string | null
	employmentType: string | null
	careerLevel: string | null
	language: string | null
	salary: string | null
	mainSkills: string | null
	postedAt: string | null
	/** Opcional no OTS 0.1: instalação sem Motor nem portal não tem para onde mandar. */
	interviewUrl?: string
}

export interface OtsJobDetails extends OtsJob {
	description: string | null
	requirements: string | null
	responsibilities: string | null
	benefits: string | null
	companyDescription: string | null
	contractType: string | null
	jobHours: string | null
	educationalRequirements: string[] | null
	requiresPreviousExperience: boolean | null
	closingDate: string | null
	interviewMode: string | null
	questionCount: number
}

export interface OtsProcessEntry {
	id: string
	jobId: string | null
	companyId: string | null
	jobName: string | null
	companyName: string | null
	companyLogo: string | null
	status: 'pending' | 'in_progress' | 'completed'
	startedAt: string | null
	completedAt: string | null
	feedback: {
		strengths: string[]
		development: string[]
		suggestions: string[]
	} | null
	rejectionExplanation: string | null
	failedRequirementLabel: string | null
	interview: {
		questionsAnswered: number
		questionsTotal: number
		interviewUrl?: string
	} | null
}

export interface OtsProfile {
	id: string
	name: string | null
	email: string | null
	phone: string | null
	photoUrl: string | null
	headline: string | null
	summary: string | null
	occupation: string | null
	level: string | null
	yearsOfExperience: number | null
	professionalObjectives: string | null
	company: string | null
	location: string | null
	countryOfResidence: string | null
	countriesOfInterest: string[] | null
	skills: string[] | null
	experiences: ReadonlyArray<object> | null
	education: ReadonlyArray<object> | null
	languages: ReadonlyArray<object> | null
	certifications: ReadonlyArray<object> | null
	resumeUrl: string | null
	linkedinUrl: string | null
	completeness: number | null
	missingFields: string[] | null
}

/** `jobName` (deprecated no wire MCP) NÃO existe no binding — só `title`. */
export function toOtsJob(job: PublicJobSummary): OtsJob {
	return {
		jobId: job.jobId,
		companyId: job.companyId,
		title: job.title,
		companyName: job.companyName,
		companyLogo: job.companyLogo,
		location: job.location,
		workModality: job.workModality,
		employmentType: job.employmentType,
		careerLevel: job.careerLevel,
		language: job.language,
		salary: job.salary,
		mainSkills: job.mainSkills,
		postedAt: job.postedAt,
		...(job.interviewUrl ? { interviewUrl: job.interviewUrl } : {}),
	}
}

export function toOtsJobDetails(job: PublicJobDetails): OtsJobDetails {
	return {
		...toOtsJob(job),
		description: job.description,
		requirements: job.requirements,
		responsibilities: job.responsibilities,
		benefits: job.benefits,
		companyDescription: job.companyDescription,
		contractType: job.contractType,
		jobHours: job.jobHours,
		educationalRequirements: job.educationalRequirements,
		requiresPreviousExperience: job.requiresPreviousExperience,
		closingDate: job.closingDate,
		interviewMode: job.interviewMode,
		questionCount: job.questionCount,
	}
}

/**
 * Participação em processo. O schema PROÍBE score/approved/fit/recommendation
 * — este mapeador é o que garante que eles nunca entram, mesmo que o shape do
 * core um dia os traga.
 */
export function toOtsProcessEntry(summary: CandidateInterviewSummary): OtsProcessEntry {
	return {
		id: summary.id,
		jobId: summary.jobId,
		companyId: summary.companyId,
		jobName: summary.jobName,
		companyName: summary.companyName,
		companyLogo: summary.companyLogo,
		status: summary.status,
		startedAt: summary.startedAt,
		completedAt: summary.completedAt,
		feedback: summary.feedback ?? null,
		rejectionExplanation: summary.rejectionExplanation ?? null,
		failedRequirementLabel: summary.failedRequirementLabel ?? null,
		interview: {
			questionsAnswered: summary.questionsAnswered,
			questionsTotal: summary.questionsTotal,
			...(summary.interviewUrl ? { interviewUrl: summary.interviewUrl } : {}),
		},
	}
}

/** Perfil portátil. Atributos protegidos (cpf/gender/...) nem têm por onde entrar. */
export function toOtsProfile(uid: string, profile: CandidateProfile | null): OtsProfile {
	return {
		id: profile?.id ?? uid,
		name: profile?.name ?? null,
		email: profile?.email ?? null,
		phone: profile?.phone ?? null,
		photoUrl: profile?.photoUrl ?? null,
		headline: profile?.headline ?? null,
		summary: profile?.summary ?? null,
		occupation: profile?.occupation ?? null,
		level: profile?.level ?? null,
		yearsOfExperience: profile?.yearsOfExperience ?? null,
		professionalObjectives: profile?.professionalObjectives ?? null,
		company: profile?.company ?? null,
		location: profile?.location ?? null,
		countryOfResidence: profile?.countryOfResidence ?? null,
		countriesOfInterest: profile?.countriesOfInterest ?? null,
		skills: profile?.skills ?? null,
		experiences: profile?.experiences ?? null,
		education: profile?.education ?? null,
		languages: profile?.languages ?? null,
		certifications: profile?.certifications ?? null,
		resumeUrl: profile?.resumeUrl ?? null,
		linkedinUrl: profile?.linkedinUrl ?? null,
		completeness: profile?.completeness ?? null,
		missingFields: profile?.missingFields ?? null,
	}
}

/**
 * OTS 0.3 — `InterviewSchedule` e `ProcessFeedback`. Allowlist explícita: o
 * `processEntryId` é a participação; quem propôs dentro da empresa, e como o
 * talento respondeu, não viajam. O link só existe na confirmada (o core já
 * corta; o mapeador corta de novo, porque é a regra do schema).
 */
export interface OtsInterviewSchedule {
	id: string
	processEntryId: string
	jobId: string | null
	jobName: string | null
	companyName: string | null
	format: MySchedule['format']
	durationMinutes: number
	timezone: string
	slots: Array<{ start: string; end: string }>
	status: MySchedule['status']
	confirmedSlot: { start: string; end: string } | null
	expiresAt: string | null
	note: string | null
	joinDetails: { meetingUrl: string | null; address: string | null; instructions: string | null } | null
	createdAt: string
}

export function toOtsSchedule(schedule: MySchedule): OtsInterviewSchedule {
	const confirmed = schedule.status === 'confirmed'
	return {
		id: schedule.id,
		processEntryId: schedule.jobAppliedId,
		jobId: schedule.jobId ?? null,
		jobName: schedule.jobName ?? null,
		companyName: schedule.companyName ?? null,
		format: schedule.format,
		durationMinutes: schedule.durationMinutes,
		timezone: schedule.timezone,
		slots: schedule.slots.map(({ start, end }) => ({ start, end })),
		status: schedule.status,
		confirmedSlot: confirmed && schedule.confirmedSlot ? { start: schedule.confirmedSlot.start, end: schedule.confirmedSlot.end } : null,
		expiresAt: schedule.expiresAt ?? null,
		note: schedule.note ?? null,
		joinDetails: confirmed && schedule.joinDetails
			? {
					meetingUrl: schedule.joinDetails.meetingUrl ?? null,
					address: schedule.joinDetails.address ?? null,
					instructions: schedule.joinDetails.instructions ?? null,
				}
			: null,
		createdAt: schedule.createdAt,
	}
}

export interface OtsProcessFeedback {
	id: string
	processEntryId: string
	jobId: string | null
	jobName: string | null
	companyName: string | null
	stage: MyProcessFeedback['stage']
	message: string
	reasonCode: MyProcessFeedback['reasonCode']
	nextStep: string | null
	sentAt: string
}

const CLOSING_STAGES = new Set(['not_selected', 'position_closed'])

export function toOtsProcessFeedback(feedback: MyProcessFeedback): OtsProcessFeedback {
	return {
		id: feedback.id,
		processEntryId: feedback.jobAppliedId,
		jobId: feedback.jobId ?? null,
		jobName: feedback.jobName ?? null,
		companyName: feedback.companyName ?? null,
		stage: feedback.stage,
		message: feedback.message,
		// motivo só em quem saiu do processo — regra do schema, repetida aqui
		reasonCode: CLOSING_STAGES.has(feedback.stage) ? (feedback.reasonCode ?? null) : null,
		nextStep: feedback.nextStep ?? null,
		sentAt: feedback.sentAt,
	}
}
