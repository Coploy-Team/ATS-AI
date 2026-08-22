import type {
	CreateInput,
	EnterpriseContract,
	UpdateInput,
} from '@coploy/domain'

export interface EnterpriseContractRepository {
	list(opts?: {
		companyId?: string
		status?: EnterpriseContract['status']
		limit?: number
	}): Promise<EnterpriseContract[]>
	getById(id: string): Promise<EnterpriseContract | null>
	listByCompany(companyId: string): Promise<EnterpriseContract[]>
	create(
		data: CreateInput<EnterpriseContract>,
		customId?: string,
	): Promise<EnterpriseContract & { id: string }>
	update(id: string, data: UpdateInput<EnterpriseContract>): Promise<void>
	delete(id: string): Promise<void>
}
