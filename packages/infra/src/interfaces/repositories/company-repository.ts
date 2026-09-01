import type { ListOptions } from '@coploy/domain'
import type { Company, CreateInput, InsightsCache, UpdateInput } from '@coploy/domain'

export interface CompanyRepository {
	getCompany(id: string): Promise<Company | null>
	listCompanies(options?: ListOptions): Promise<Company[]>
	createCompany(data: CreateInput<Company>, customId?: string): Promise<Company & { id: string }>
	updateCompany(id: string, data: UpdateInput<Company>): Promise<void>
	getInsightsCache(companyId: string, id: string): Promise<InsightsCache | null>
	setInsightsCache(companyId: string, id: string, data: CreateInput<InsightsCache>): Promise<void>
	listInsightsCache(companyId: string, options?: ListOptions): Promise<InsightsCache[]>
	createInsightsCache(companyId: string, data: CreateInput<InsightsCache>): Promise<InsightsCache & { id: string }>
}