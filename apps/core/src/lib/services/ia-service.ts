import type { InfraProvider } from '@coploy/infra'

export function createIaService(infra: InfraProvider) {
  return {
    async getUsersCompany(userId: string) {
      return infra.userRepository.getUsersCompany(userId)
    },
    async getJob(companyId: string, jobId: string) {
      return infra.jobRepository.getJob(companyId, jobId)
    },
  }
}
