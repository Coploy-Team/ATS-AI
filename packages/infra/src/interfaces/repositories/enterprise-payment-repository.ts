import type {
	CreateInput,
	EnterprisePayment,
	UpdateInput,
} from '@coploy/domain'

export interface EnterprisePaymentRepository {
	list(opts?: {
		companyId?: string
		contractId?: string
		status?: EnterprisePayment['status']
		sinceUnix?: number
		limit?: number
	}): Promise<EnterprisePayment[]>
	getById(id: string): Promise<EnterprisePayment | null>
	listByCompany(companyId: string): Promise<EnterprisePayment[]>
	create(
		data: CreateInput<EnterprisePayment>,
		customId?: string,
	): Promise<EnterprisePayment & { id: string }>
	update(id: string, data: UpdateInput<EnterprisePayment>): Promise<void>
	delete(id: string): Promise<void>
}
