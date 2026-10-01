import type { InfraProvider } from '@coploy/infra'
import type { QueryFilter } from '@coploy/domain'

export function createConversationService(infra: InfraProvider) {
  return {
    async getConversationContext(phone: string, jobId: string) {
      return infra.conversationRepository.getConversationContext(phone, jobId)
    },
    async createConversationContext(phone: string, jobId: string, data: Record<string, unknown>) {
      return infra.conversationRepository.createConversationContext(phone, jobId, data)
    },
    async updateConversationContext(phone: string, jobId: string, data: Record<string, unknown>) {
      return infra.conversationRepository.updateConversationContext(phone, jobId, data)
    },
    async listConversationContexts(phone: string, options?: { filters?: QueryFilter[] }) {
      return infra.conversationRepository.listConversationContexts(phone, options)
    },
    async getJob(companyId: string, jobId: string) {
      return infra.jobRepository.getJob(companyId, jobId)
    },
  }
}
