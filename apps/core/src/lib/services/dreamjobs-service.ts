import type { InfraProvider } from '@coploy/infra'

export function createDreamJobsService(infra: InfraProvider) {
  return {
    async getCandidateProfile(userId: string) {
      return infra.userRepository.getCandidateProfile(userId)
    },
    async createCandidateProfile(profileData: Record<string, unknown>, userId: string) {
      return infra.userRepository.createCandidateProfile(profileData, userId)
    },
    async updateCandidateProfile(userId: string, data: Record<string, unknown>) {
      return infra.userRepository.updateCandidateProfile(userId, data)
    },
    async getUser(userId: string) {
      return infra.userRepository.getUser(userId)
    },
    async updateUser(userId: string, data: Record<string, unknown>) {
      return infra.userRepository.updateUser(userId, data)
    },
    async getJobApplied(userId: string, jobAppliedId: string) {
      return infra.candidateRepository.getJobApplied(userId, jobAppliedId)
    },
    async uploadFile(buffer: Buffer, path: string, filename: string, mimeType: string) {
      return infra.storage.uploadFile(buffer, path, filename, mimeType)
    },
  }
}
