import type {
	AdminCandidateSummary,
	AdminCandidateSummaryInterview,
	ListOptions,
} from '@coploy/domain'
import type { CandidateLike, CompanyInterview, CreateInput, JobApplied, PublicInterview, UpdateInput } from '@coploy/domain'

export interface CandidateRepository {
	getJobApplied(userId: string, jobAppliedId: string): Promise<JobApplied | null>
	listJobsApplied(userId: string, options?: ListOptions): Promise<JobApplied[]>
	createJobApplied(userId: string, data: CreateInput<JobApplied>, customId?: string): Promise<JobApplied & { id: string }>
	updateJobApplied(userId: string, id: string, data: UpdateInput<JobApplied>): Promise<void>
	/**
	 * Atualiza o jobApplied dentro de uma transação atômica.
	 * O callback recebe o documento atual e retorna as alterações.
	 * Se houver conflito (outro write concorrente), a transação é retentada automaticamente.
	 */
	updateJobAppliedInTransaction(
		userId: string,
		id: string,
		updateFn: (current: JobApplied) => UpdateInput<JobApplied>,
	): Promise<void>
	setJobApplied(userId: string, id: string, data: CreateInput<JobApplied>): Promise<void>
	listCompanyInterviews(companyId: string, options?: ListOptions): Promise<CompanyInterview[]>
	/**
	 * Lookup direto de uma entrevista da empresa pelo docId. Substitui o
	 * antipattern `listCompanyInterviews + .find()` que carregava a coleção
	 * inteira só pra achar 1 doc (causando 503 em prod com empresas grandes).
	 *
	 * Aceita também o `job_applied_ref.id` como `interviewId` (legado): adapters
	 * tentam o doc direto primeiro e caem em `where('job_applied_ref.id','==',id)`
	 * caso não exista. Retorna `null` se nada encontrado.
	 */
	getCompanyInterview(companyId: string, interviewId: string): Promise<(CompanyInterview & { id: string }) | null>
	/**
	 * Conta entrevistas da empresa via aggregation server-side (sem ler os docs).
	 * Substitui o padrão `listCompanyInterviews().length` em telas de admin.
	 *
	 * Filtros suportados:
	 * - `finished`: true → only `finished == true`
	 * - `dateGte`: filtra `date >= dateGte` (limite inferior inclusivo)
	 *
	 * GCP: usa `.count().get()` do Firestore (1 unidade de leitura por 1k docs
	 * agregados). Combinar `finished + dateGte` exige índice composto — em caso
	 * de FAILED_PRECONDITION retorna `null` para o caller decidir o fallback.
	 */
	countCompanyInterviews(
		companyId: string,
		filters?: { finished?: boolean; dateGte?: Date },
	): Promise<number | null>
	listAdminCandidateSummaries(options?: {
		limit?: number
		offset?: number
		search?: string
		/**
		 * Quando false (default), pula a leitura da subcol `interviews` por candidato.
		 * O list view do admin não renderiza `interviews[]` — usa só os agregados do
		 * doc summary (totalInterviews, finishedInterviews, lastDate, etc). Manter
		 * em true em produção causa 4k+ subcol fetches em paralelo (~10s+ pra abrir
		 * a tela). Detail view usa `getAdminCandidateSummary(id)`.
		 */
		includeInterviews?: boolean
	}): Promise<AdminCandidateSummary[]>
	/**
	 * Busca 1 summary por docId, sempre com `interviews[]` populadas. Usado pela
	 * tela de detalhe do candidato no admin.
	 */
	getAdminCandidateSummary(id: string): Promise<AdminCandidateSummary | null>
	/**
	 * Fast-path pra search global do admin: busca por exact match em campos
	 * indexados (email, userId). Retorna 0..N summaries sem `interviews[]`.
	 * Não usa orderBy pra evitar índice composto.
	 */
	findAdminCandidateSummariesByExact(
		field: 'email' | 'userId',
		value: string,
	): Promise<AdminCandidateSummary[]>
	/**
	 * Busca por token em `keywords[]` (array-contains). Token é lowercased e
	 * pode ser prefixo (ex: "henr") porque sync popula prefixos 2-20 chars.
	 * Retorna sem `interviews[]`. Limit recomendado: 200 (Firestore array-contains
	 * é fast mas array_contains_any tem cap de 10 valores — usar 1 token por chamada).
	 */
	searchAdminCandidateSummariesByKeyword(
		token: string,
		options?: { limit?: number },
	): Promise<AdminCandidateSummary[]>
	countAdminCandidateSummaries(options?: { search?: string }): Promise<number | null>
	syncAdminCandidateSummaryInterview(
		companyId: string,
		interviewId: string,
		data: UpdateInput<CompanyInterview>,
	): Promise<void>
	listJobInterviews(companyId: string, jobId: string, options?: ListOptions): Promise<CompanyInterview[]>
	/**
	 * Cross-company list (admin-only). Newest first.
	 * `dateGte` faz scope server-side por data (>=) — usado por dashboards/relatórios
	 * que precisam de uma janela temporal (ex: últimos 30d, mês X). Sem isso, o
	 * caller cai no cap de `limit` e pode perder dados quando o volume passa do teto.
	 */
	listAllCompanyInterviews(opts?: {
		limit?: number
		companyId?: string
		status?: string
		dateGte?: Date
		startAfterDate?: Date | string
	}): Promise<CompanyInterview[]>
	/**
	 * Iteração exhaustiva de `companyInterviews` para backfill de telas
	 * materializadas (admin candidates). Diferente de `listAllCompanyInterviews`,
	 * ordena por `__name__` (docId) e pagina por cursor docId — visita TODOS os
	 * docs, incluindo legados sem campo `date`. Ordem não tem semântica de
	 * "newest-first"; é só pra varrer a coleção uma vez.
	 *
	 * Cursor é o docId da última entrevista do lote anterior (ou null pra começar).
	 */
	listCompanyInterviewsForBackfill(opts?: {
		limit?: number
		cursorDocId?: string
	}): Promise<(CompanyInterview & { id: string })[]>
	listPublicInterviews(options?: ListOptions): Promise<PublicInterview[]>
	/**
	 * Todas as entrevistas públicas de um conjunto de pessoas.
	 *
	 * O pool é paginado por entrevista e agrupado por pessoa DEPOIS — então o
	 * agrupamento só enxergava o lote corrente. Quem tinha entrevistas
	 * espalhadas por páginas aparecia repetido, cada vez com a média do que
	 * calhou de cair naquela página. Para agrupar certo é preciso ver todas as
	 * entrevistas da pessoa, não só as do lote.
	 *
	 * `userIds` são uids (`users/{uid}`); o adapter monta a referência.
	 */
	listPublicInterviewsByUsers(userIds: string[]): Promise<PublicInterview[]>
	getPublicInterview(id: string): Promise<PublicInterview | null>
	/**
	 * Espelha a entrevista finalizada na coleção `public_interviews` (hunting dashboard).
	 * Idempotente: se já existir um doc para o `jobAppliedId`, faz merge; senão, cria novo.
	 *
	 * GCP: upsert real na coleção Firestore, deduplicado por `job_applied_ref.id`.
	 * Selfhosted: no-op — `public_interviews` é VIEW derivada de `jobs_applied`, com filtro
	 * `subscriptionPlan != enterprise` e `typeInterview = 'interview'` aplicado nativamente.
	 */
	upsertPublicInterview(jobAppliedId: string, data: CreateInput<PublicInterview>): Promise<void>
	/**
	 * Update parcial pelo Firestore docId direto. Usado pelo backfill de
	 * `score_value` em docs legados — onde `upsertPublicInterview` falha porque
	 * `job_applied_ref` é DocumentReference, não map com `.id`.
	 */
	updatePublicInterview(id: string, data: Partial<PublicInterview>): Promise<void>
	listCandidateLikes(userId: string, jobAppliedId: string): Promise<CandidateLike[]>
	createCandidateLike(userId: string, jobAppliedId: string, data: CreateInput<CandidateLike>): Promise<CandidateLike & { id: string }>
	deleteCandidateLike(userId: string, jobAppliedId: string, likeId: string): Promise<void>
	getJobInterview(companyId: string, jobId: string, interviewId: string): Promise<JobApplied | null>
	setJobInterview(companyId: string, jobId: string, interviewId: string, data: UpdateInput<JobApplied>): Promise<void>
	updateJobInterview(companyId: string, jobId: string, interviewId: string, data: UpdateInput<JobApplied>): Promise<void>
	setCompanyInterview(companyId: string, interviewId: string, data: UpdateInput<CompanyInterview>): Promise<void>
	updateCompanyInterview(companyId: string, interviewId: string, data: UpdateInput<CompanyInterview>): Promise<void>
	deleteJobApplied(userId: string, id: string): Promise<void>
	deleteJobInterview(companyId: string, jobId: string, interviewId: string): Promise<void>
	deleteCompanyInterview(companyId: string, interviewId: string): Promise<void>
}
