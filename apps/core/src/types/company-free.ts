import type { Company } from '@coploy/domain'

export type AuthCreatedUser = {
	uid: string
	email: string
	displayName?: string
}

export type CompanyFreeUserData = {
	fullName: string
	occupation?: string | null
	email: string
	phone: string
	password: string
}

export type CompanyFreeCompanyData = {
	name: string
	logoUrl?: string | null
	employees?: string | null
	segment?: string | null
	location?: string | null
	website?: string | null
	objective?: string[] | null
	typeInterview?: string[] | null
	notificationsEmail: boolean
	notificationReportWeek: boolean
	headquartersCountries?: string[] | null
	evaluateInternationalCandidates?: boolean
}

export type CompanyFreeRequest = {
	user: CompanyFreeUserData
	company: CompanyFreeCompanyData
}

export type CompanyFreeResponse = {
	company: {
		id: string
		companLogo: string | null
		companySize: string
		segment: string | null
		companyCity: string
		companyWebsite: string
		subscriptionPlan: string
	}
	user: {
		id: string
		email: string
		display_name: string
		is_owner: boolean
	}
}

export type CompanyCreationResult = {
	user: AuthCreatedUser
	company: Company & { id: string }
}
