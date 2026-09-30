import type { InfraProvider } from '@coploy/infra'
import type { QueryFilter } from '@coploy/domain'
import type { JobApplied } from '@coploy/domain'

export function createNotificationService(infra: InfraProvider) {
  return {
    async listCompanyNotifications(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc'; limitTo?: number }) {
      return infra.notificationRepository.listCompanyNotifications(companyId, options)
    },
    async updateCompanyNotification(companyId: string, notificationId: string, data: Record<string, unknown>) {
      return infra.notificationRepository.updateCompanyNotification(companyId, notificationId, data)
    },
    async deleteCompanyNotification(companyId: string, notificationId: string) {
      return infra.notificationRepository.deleteCompanyNotification(companyId, notificationId)
    },
    async createCompanyNotification(companyId: string, data: Record<string, unknown>) {
      return infra.notificationRepository.createCompanyNotification(companyId, data)
    },
    async getNotificationMessage(companyId: string, messageId: string) {
      return infra.notificationRepository.getNotificationMessage(companyId, messageId)
    },
    async createNotificationMessage(companyId: string, data: Record<string, unknown>) {
      return infra.notificationRepository.createNotificationMessage(companyId, data)
    },
    async listNotificationMessages(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc' }) {
      return infra.notificationRepository.listNotificationMessages(companyId, options)
    },
    async updateNotificationMessage(companyId: string, messageId: string, data: Record<string, unknown>) {
      return infra.notificationRepository.updateNotificationMessage(companyId, messageId, data)
    },
    async deleteNotificationMessage(companyId: string, messageId: string) {
      return infra.notificationRepository.deleteNotificationMessage(companyId, messageId)
    },
    async extractJobIdFromActionRef(actionRef: string | undefined): Promise<string | null> {
      if (!actionRef) return null
      try {
        const segments = actionRef.split('/').filter((segment) => segment !== '')

        // Resolve (userId, jobAppliedId) a partir dos formatos conhecidos:
        //  - users/{userId}/jobsApplied/{id}   (legado, 4+ segmentos com prefixo "users")
        //  - {userId}/jobsApplied/{id}         (novo, 3 segmentos)
        let userId: string | null = null
        let jobAppliedId: string | null = null

        if (segments.length >= 4 && segments[0] === 'users' && segments[2] === 'jobsApplied') {
          userId = segments[1]
          jobAppliedId = segments[3]
        } else if (segments.length >= 3 && segments[1] === 'jobsApplied') {
          userId = segments[0]
          jobAppliedId = segments[2]
        }

        if (!userId || !jobAppliedId) return null

        const jobAppliedDoc = (await infra.candidateRepository.getJobApplied(userId, jobAppliedId)) as JobApplied | null
        if (!jobAppliedDoc) return null
        const jobApplied = jobAppliedDoc.jobApplied as { path?: string; id?: string } | undefined
        if (!jobApplied) return null
        const jobPath = jobApplied.path ?? ''
        return (jobPath.split('/').pop() || jobApplied.id) || null
      } catch {
        return null
      }
    },
  }
}
