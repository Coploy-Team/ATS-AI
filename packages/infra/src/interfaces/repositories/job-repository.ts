import type { ListOptions } from '@coploy/domain'
import type { CreateInput, InfoJob, InterviewWhatsapp, JobPortal, PostJob, UpdateInput } from '@coploy/domain'

export interface JobRepository {
	getJob(companyId: string, jobId: string): Promise<PostJob | null>
	listJobs(companyId: string, options?: ListOptions): Promise<PostJob[]>
	/**
	 * Lista vagas com `public == true` cross-company (descoberta de vagas — MCP server).
	 * Retorna `companyId` junto porque vagas vivem em subcoleção por empresa e o
	 * caller precisa do par (companyId, jobId) pra montar link/lookup.
	 *
	 * GCP: collectionGroup('postJob') ordenado por timeCreated desc — exige índice
	 * COLLECTION_GROUP (public ASC + timeCreated DESC); em FAILED_PRECONDITION
	 * retorna lista vazia até o índice provisionar.
	 * Filtros de negócio (stopped/archived/closingDate/language) ficam no service.
	 */
	listPublicJobs(options?: { limit?: number }): Promise<(PostJob & { companyId: string })[]>
	/**
	 * Lista vagas públicas de uma empresa específica para careers page.
	 * Filtros de negócio (stopped/archived/closingDate/profileInterview) ficam no service.
	 */
	listPublicJobsByCompany(companyId: string, options?: { limit?: number }): Promise<PostJob[]>
	createJob(companyId: string, data: CreateInput<PostJob>, customId?: string): Promise<PostJob & { id: string }>
	updateJob(companyId: string, jobId: string, data: UpdateInput<PostJob>): Promise<void>
	syncPostJobUsersApplied(companyId: string, jobId: string, userId: string): Promise<void>
	getInfoJobByPostJob(companyId: string, jobId: string): Promise<InfoJob | null>
	deleteJob(companyId: string, jobId: string): Promise<void>
	listInfoJobs(companyId: string): Promise<InfoJob[]>
	getInfoJob(companyId: string, id: string): Promise<InfoJob | null>
	createInfoJob(companyId: string, data: CreateInput<InfoJob>, customId?: string): Promise<InfoJob & { id: string }>
	updateInfoJob(companyId: string, id: string, data: UpdateInput<InfoJob>): Promise<void>
	deleteInfoJob(companyId: string, id: string): Promise<void>
	getJobPortal(id: string): Promise<JobPortal | null>
	/**
	 * Portal pelo dono. No GCP o elo canônico é `company.jobPortal` (ref no
	 * doc); no selfhosted esse ref não existe (`mapCompanyToRow` não tem onde
	 * gravá-lo) e o elo real é a coluna `company_id` do portal — que os DOIS
	 * providers já gravam na criação. É o fallback da página de carreiras.
	 */
	getJobPortalByCompany(companyId: string): Promise<JobPortal | null>
	createJobPortal(data: CreateInput<JobPortal>, customId?: string): Promise<JobPortal & { id: string }>
	updateJobPortal(id: string, data: UpdateInput<JobPortal>): Promise<void>
	createInterviewWhatsapp(data: CreateInput<InterviewWhatsapp>, customId?: string): Promise<InterviewWhatsapp & { id: string }>
}
