
export type Interview = {
	id: string
	candidate_status: string
	date_select: Date
	finished: boolean
	job_applied_ref: { id: string; path?: string }
	name: string
	user_ref: { id: string; path?: string }
	career_level: string
	city: string
	date: Date
	email: string
	external_id: string
	job_description: string
	job_ref: { id: string; path?: string }
	job_name: string
	occupation: string
	phone_number: string
	photo_url: string
	professional_experience: string
	score: string
	state: string
	stopped: boolean
	type_interview: string
}
