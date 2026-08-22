import type { InfraProvider } from '@coploy/infra'
import type { Company, CompanyInterview, PostJob, QueryFilter } from '@coploy/domain'

export function createDashboardService(infra: InfraProvider) {
  return {
    async getUsersCompany(userId: string) {
      return infra.userRepository.getUsersCompany(userId)
    },
    async getCompany(companyId: string) {
      return infra.companyRepository.getCompany(companyId)
    },
    async listJobs(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc' }) {
      return infra.jobRepository.listJobs(companyId, options)
    },
    async listCompanyInterviews(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc' }) {
      return infra.candidateRepository.listCompanyInterviews(companyId, options)
    },
    async listNps(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc' }) {
      return infra.billingRepository.listNps(companyId, options)
    },
    async listCollaborators(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc' }) {
      return infra.collaboratorRepository.listCollaborators(companyId, options)
    },
  }
}
