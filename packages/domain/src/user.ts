import type { EntityRef } from './common'

export interface User {
	id: string
	uuid?: string | null
	display_name?: string | null
	first_name?: string | null
	last_name?: string | null
	email?: string | null
	phone_number?: string | null
	photo_url?: string | null
	is_owner?: boolean | null
	language?: string | null
	countryOfResidence?: string | null
	countriesOfInterest?: string[] | null
	professionalObjectives?: string | null
	resumeUrl?: string | null
	occupation?: string | null
	level?: string | null
	state?: string | null
	city?: string | null
	external_id?: string | null
	professionalExperience?: string | null
	/** GCP snake_case alias for professionalExperience */
	professional_experience?: string | null
	/** GCP-specific academic background field */
	academic?: string | null
	/** Interview status flag */
	finished?: boolean | null
	/** Socio-emotional PDF report URL */
	pdf_socioEmotional?: string | null
	/** Testing/demo account flag */
	testing?: boolean | null
	created_time?: Date | null
	paymentDetails?: {
		stripeCustomerId?: string | null
		paied?: boolean | null
		paidDate?: Date | null
		messageError?: string | null
		dateError?: Date | null
	} | null
	dreamJobsInterview?: {
		jobId?: string | null
		jobAppliedId?: string | null
		createdAt?: Date | null
		status?: string | null
		completedAt?: Date | null
		generalFeedback?: string | null
	} | null
}

export interface UsersCompany {
	id: string
	uuid?: string | null
	company?: EntityRef | null
	display_name?: string | null
	email?: string | null
	first_name?: string | null
	last_name?: string | null
	occupation?: string | null
	phone_number?: string | null
	photo_url?: string | null
	is_owner?: boolean | null
	access_level?: string | null
	created_time?: Date | null
}

/** Alias for UsersCompany — same shape, used as candidate-facing profile. */
// CandidateProfile virou tipo próprio (currículo vivo) em ./candidate-profile.
// Era alias de UsersCompany, o que misturava usuário de empresa com candidato.
