import type { ListOptions } from '@coploy/domain'
import type { Collaborator, CreateInput, UpdateInput } from '@coploy/domain'

export interface CollaboratorRepository {
	listCollaborators(companyId: string, options?: ListOptions): Promise<Collaborator[]>
	/** Cross-company list (admin-only). Hydrates company_id from parent path. */
	listAllCollaborators(opts?: { limit?: number; companyId?: string }): Promise<Collaborator[]>
	getCollaborator(companyId: string, id: string): Promise<Collaborator | null>
	createCollaborator(companyId: string, data: CreateInput<Collaborator>): Promise<Collaborator & { id: string }>
	updateCollaborator(companyId: string, id: string, data: UpdateInput<Collaborator>): Promise<void>
	deleteCollaborator(companyId: string, id: string): Promise<void>
}