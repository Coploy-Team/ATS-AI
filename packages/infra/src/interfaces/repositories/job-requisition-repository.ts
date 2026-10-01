import type { CreateInput, JobRequisition, UpdateInput } from '@coploy/domain'

/** Requisições de vaga (V2-401). */
export interface JobRequisitionRepository {
	listRequisitions(companyId: string, status?: string): Promise<JobRequisition[]>
	getRequisition(companyId: string, id: string): Promise<JobRequisition | null>
	createRequisition(
		companyId: string,
		data: CreateInput<JobRequisition>,
	): Promise<JobRequisition & { id: string }>
	updateRequisition(companyId: string, id: string, data: UpdateInput<JobRequisition>): Promise<void>
}
