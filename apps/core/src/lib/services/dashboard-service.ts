import { interviewInScope } from '@/lib/access-scope'
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
    /*
     * As duas listas que o painel inteiro consome — e o lugar onde o alcance
     * do recrutador é aplicado.
     *
     * A parede mora aqui, e não em cada uma das dez rotas de painel, porque
     * número agregado é vazamento silencioso: a distribuição de notas e o
     * funil continuariam contando candidatos de vaga que a pessoa não pode
     * abrir, sem nada na tela indicando isso.
     */
    async listJobs(
      companyId: string,
      options?: {
        filters?: QueryFilter[]
        orderByField?: string
        orderDirection?: 'asc' | 'desc'
        /** Presente = só as vagas criadas por esta pessoa. */
        scopedToUserId?: string | null
      },
    ) {
      // `options` ausente segue ausente: trocar por `{}` é diferença silenciosa
      // na chamada ao repositório, e um teste existente já protegia isso
      if (!options) return infra.jobRepository.listJobs(companyId, undefined)
      const { scopedToUserId, ...rest } = options
      const filters = scopedToUserId
        ? [...(rest.filters ?? []), { field: 'creatorId', operator: '==' as const, value: scopedToUserId }]
        : rest.filters
      return infra.jobRepository.listJobs(companyId, { ...rest, filters })
    },
    async listCompanyInterviews(
      companyId: string,
      options?: {
        filters?: QueryFilter[]
        orderByField?: string
        orderDirection?: 'asc' | 'desc'
        /** Presente = só as entrevistas destas vagas. `null` = todas. */
        jobIdsInScope?: Set<string> | null
      },
    ) {
      if (!options) return infra.candidateRepository.listCompanyInterviews(companyId, undefined)
      const { jobIdsInScope, ...rest } = options
      const rows = await infra.candidateRepository.listCompanyInterviews(companyId, rest)
      if (!jobIdsInScope) return rows
      return rows.filter((row) => interviewInScope(row, jobIdsInScope))
    },
    async listNps(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc' }) {
      return infra.npsRepository.listNps(companyId, options)
    },
    async listCollaborators(companyId: string, options?: { filters?: QueryFilter[]; orderByField?: string; orderDirection?: 'asc' | 'desc' }) {
      return infra.collaboratorRepository.listCollaborators(companyId, options)
    },
  }
}
