import type { EntityRef } from './common'

export interface Collaborator {
	id: string
	company_id?: string | null
	user_company_id?: string | null
	name?: string | null
	email?: string | null
	accessLevel?: string | null
	status?: boolean | null
	creationDate?: Date | null
	/** Reference to the associated UsersCompany document. */
	userRef?: EntityRef | null
}
