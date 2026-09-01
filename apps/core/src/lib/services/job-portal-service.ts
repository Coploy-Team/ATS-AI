import type { InfraProvider } from '@coploy/infra'
import type { Company, JobPortal } from '@coploy/domain'

export function createJobPortalService(infra: InfraProvider) {
  return {
    async getJobPortal(jobPortalId: string) {
      return infra.jobRepository.getJobPortal(jobPortalId)
    },
    /**
     * Portal da empresa, venha de onde vier o elo.
     *
     * No GCP o doc da empresa carrega o ref `jobPortal`; no selfhosted esse
     * ref não existe (`mapCompanyToRow` não tem coluna pra ele) e o elo real
     * é o `company_id` gravado no próprio portal. As rotas que resolviam SÓ
     * pelo ref respondiam "não tem portal" pra sempre na distribuição open.
     */
    async resolvePortal(company: Company & { id: string }): Promise<(JobPortal & { id: string }) | null> {
      const refId =
        typeof company.jobPortal === 'string'
          ? company.jobPortal
          : (company.jobPortal as { id?: string } | null | undefined)?.id
      if (refId) {
        const byRef = await infra.jobRepository.getJobPortal(refId)
        if (byRef) return byRef as JobPortal & { id: string }
      }
      return (await infra.jobRepository.getJobPortalByCompany(company.id)) as
        | (JobPortal & { id: string })
        | null
    },
    /**
     * Garante um portal pra empresa — o mínimo dele, sem domínio.
     *
     * O POST /job-portal do SaaS provisiona subdomínio (Firebase Hosting +
     * CNAME); branding não depende de nada disso. Na distribuição open o
     * portal nasce aqui, com o id = companyId (uma empresa, um portal), na
     * primeira vez que a empresa salva uma cor ou sobe um banner.
     */
    async ensurePortal(company: Company & { id: string }): Promise<JobPortal & { id: string }> {
      const existing = await this.resolvePortal(company)
      if (existing) return existing
      const created = (await infra.jobRepository.createJobPortal(
        { company_id: company.id, bannerUrl: '', logoUrl: '' },
        company.id,
      )) as JobPortal & { id: string }
      // melhor esforço: no GCP o ref é o elo canônico; no selfhosted é no-op
      await infra.companyRepository
        .updateCompany(company.id, { jobPortal: { id: created.id } })
        .catch(() => undefined)
      return created
    },
    async updateJobPortal(jobPortalId: string, data: Record<string, unknown>) {
      return infra.jobRepository.updateJobPortal(jobPortalId, data)
    },
    async createJobPortal(data: Record<string, unknown>, defaultDomainUrl?: string) {
      return infra.jobRepository.createJobPortal(data, defaultDomainUrl)
    },
    async uploadFile(buffer: Buffer, path: string, filename: string, mimeType: string) {
      return infra.storage.uploadFile(buffer, path, filename, mimeType)
    },
    async updateCompany(companyId: string, data: Record<string, unknown>) {
      return infra.companyRepository.updateCompany(companyId, data)
    },
  }
}
