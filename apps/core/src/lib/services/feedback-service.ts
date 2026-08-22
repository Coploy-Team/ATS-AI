import type { InfraProvider } from '@coploy/infra'
import type { CreateInput, Nps, QueryFilter } from '@coploy/domain'

export function createFeedbackService(infra: InfraProvider) {
  return {
    async listNps(
      companyId: string,
      options?: {
        filters?: QueryFilter[]
        orderByField?: string
        orderDirection?: 'asc' | 'desc'
        limitTo?: number
      },
    ) {
      return infra.billingRepository.listNps(companyId, options)
    },

    async getJob(companyId: string, jobId: string) {
      return infra.jobRepository.getJob(companyId, jobId)
    },

    async getUser(userId: string) {
      return infra.userRepository.getUser(userId)
    },

    async createNps(companyId: string, data: CreateInput<Nps>) {
      return infra.billingRepository.createNps(companyId, data)
    },
  }
}
