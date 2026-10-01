import type { InfraProvider } from '@coploy/infra'

export function createAuthService(infra: InfraProvider) {
  return {
    async findUserByPhone(phone_number: string) {
      return infra.userRepository.findUserByPhone(phone_number)
    },
    async getUsersCompany(userId: string) {
      return infra.userRepository.getUsersCompany(userId)
    },
    async getUser(userId: string) {
      return infra.userRepository.getUser(userId)
    },
    async createUser(data: Record<string, unknown>, uid: string) {
      return infra.userRepository.createUser(data, uid)
    },
    async updateUser(userId: string, updates: Record<string, unknown>) {
      return infra.userRepository.updateUser(userId, updates)
    },
    async createUsersCompany(data: Record<string, unknown>, uid: string) {
      return infra.userRepository.createUsersCompany(data, uid)
    },
    async getCandidateProfile(userId: string) {
      return infra.userRepository.getCandidateProfile(userId)
    },
    async createCandidateProfile(profileData: Record<string, unknown>, userId: string) {
      return infra.userRepository.createCandidateProfile(profileData, userId)
    },
    async updateCandidateProfile(userId: string, data: Record<string, unknown>) {
      return infra.userRepository.updateCandidateProfile(userId, data)
    },
    async getJobApplied(userId: string, jobAppliedId: string) {
      return infra.candidateRepository.getJobApplied(userId, jobAppliedId)
    },
    async verifyToken(token: string) {
      return infra.auth.verifyToken(token)
    },
    async createUser_auth(data: { email: string; password: string; displayName: string; phoneNumber?: string }) {
      return infra.auth.createUser(data)
    },
    get createUserAndGetToken() {
      return infra.auth.createUserAndGetToken
    },
  }
}
