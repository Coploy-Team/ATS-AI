import { toDate } from '@/lib/date-formatter'
import { removeUndefinedFields } from '@/lib/remove-undefined-fields'
import { generateSlug } from '@/lib/services/company-free-service'
import { ANTI_GHOSTING_CONFIG } from '@/lib/services/anti-ghosting-config'
import { createAntiGhostingSlaService } from '@/lib/services/anti-ghosting-sla-service'
import { createTaxonomyService } from './taxonomy-service'
import { getCompanyIdFromUser } from '@/lib/user-company'
import type {
  JobCandidatesResult,
  JobFilters,
  JobSearchResult,
  JobsWithInterviews,
  ProcessedInterview,
  ProcessedJob,
} from '@/types/jobs-filters'
import type { CompanyInterview, PostJob, QueryFilter, UsersCompany } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'

export function processJobCandidates(
  interviews: CompanyInterview[],
  candidatesLimit: number
): JobCandidatesResult {
  const usersApplied = interviews.map((interview): ProcessedInterview => {
    const jobAppliedId = interview.job_applied_ref?.id

    return {
      ...interview,
      date: toDate(interview.date),
      job_applied_ref: jobAppliedId || null,
      user_ref: interview.user_ref?.id || null,
      job_ref: interview.job_ref?.id || null,
      dateSelect: toDate(interview.dateSelect),
      candidateStatus: interview.candidateStatus,
    }
  })

  const limitedUsersApplied = usersApplied.slice(0, candidatesLimit)
  const totalCandidates = usersApplied.length

  // Distribuição por etapa sobre TODOS os candidatos (o slice do limit é só
  // pra payload de lista) — é o que alimenta as barras por etapa no ats.
  // Chave normalizada (trim + lowercase) e ausência = `pending`, mesma régua
  // do funil em get-jobs-performance: "pendente" é quem não teve decisão.
  const stageCounts: Record<string, number> = {}
  // Tempo médio parado em cada etapa, em dias. `dateSelect` é gravado com
  // `new Date()` a cada mudança de status (kanban bulk e update individual),
  // então é o "entrou nesta etapa em"; sem ele, o candidato nunca foi movido
  // e o relógio conta desde a candidatura (`date`).
  const stageDaysSum: Record<string, number> = {}
  const now = Date.now()

  for (const interview of interviews) {
    const raw = interview.candidateStatus
    const stage = typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : 'pending'
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1

    const since = toDate(interview.dateSelect) ?? toDate(interview.date)
    if (since) {
      const days = Math.max(0, (now - since.getTime()) / 86_400_000)
      stageDaysSum[stage] = (stageDaysSum[stage] ?? 0) + days
    }
  }

  const stageDays: Record<string, number> = {}
  for (const [stage, sum] of Object.entries(stageDaysSum)) {
    const count = stageCounts[stage] ?? 1
    stageDays[stage] = Math.round((sum / count) * 10) / 10
  }

  return {
    usersApplied: limitedUsersApplied,
    totalCandidates,
    hasMoreCandidates: totalCandidates > candidatesLimit,
    stageCounts,
    stageDays,
  }
}

// ============================================================================
// CONSTRUIR FILTROS DE JOBS
// ============================================================================

function buildJobFilters(filters: JobFilters): QueryFilter[] {
  const queryFilters: QueryFilter[] = []

  if (filters.status !== 'all') {
    const shouldBeStopped = filters.status === 'inactive'
    queryFilters.push({ field: 'stopped', operator: '==', value: shouldBeStopped })
  }

  queryFilters.push({ field: 'archived', operator: '==', value: filters.showArchived === true })

  if (filters.language !== 'all') {
    queryFilters.push({ field: 'language', operator: '==', value: filters.language })
  }

  if (filters.segment !== 'all') {
    queryFilters.push({ field: 'jobCategories', operator: '==', value: filters.segment })
  }

  if (filters.level !== 'all') {
    queryFilters.push({ field: 'carrerLevel', operator: '==', value: filters.level })
  }

  if (filters.country !== 'all') {
    queryFilters.push({ field: 'address.country', operator: '==', value: filters.country })
  }

  if (filters.state !== 'all') {
    queryFilters.push({ field: 'address.state', operator: '==', value: filters.state.toUpperCase() })
  }

  if (filters.city !== 'all') {
    queryFilters.push({ field: 'address.city', operator: '==', value: filters.city.toLowerCase() })
  }

  if (filters.interviewType && filters.interviewType.length > 0 && !filters.interviewType.includes('all')) {
    if (filters.interviewType.length === 1) {
      queryFilters.push({ field: 'typeInterview', operator: '==', value: filters.interviewType[0] })
    } else if (filters.interviewType.length <= 30) {
      queryFilters.push({ field: 'typeInterview', operator: 'in', value: filters.interviewType })
    }
  }

  if (filters.creatorId && filters.creatorId !== 'all') {
    queryFilters.push({ field: 'creatorId', operator: '==', value: filters.creatorId })
  }

  if (filters.priority && filters.priority !== 'all') {
    queryFilters.push({ field: 'priority', operator: '==', value: filters.priority === 'true' })
  }

  return queryFilters
}

const COMPOUND_CURSOR_SEPARATOR = '|'

function encodeJobsCursor(priority: boolean, timeCreated: Date): string {
  return `${priority ? 'true' : 'false'}${COMPOUND_CURSOR_SEPARATOR}${timeCreated.toISOString()}`
}

function decodeJobsCursor(cursor: string): { priority: boolean; timeCreated: Date } | null {
  if (!cursor) return null
  if (cursor.includes(COMPOUND_CURSOR_SEPARATOR)) {
    const [priorityRaw, isoRaw] = cursor.split(COMPOUND_CURSOR_SEPARATOR)
    const date = new Date(isoRaw)
    if (Number.isNaN(date.getTime())) return null
    return { priority: priorityRaw === 'true', timeCreated: date }
  }
  // Legado: cursor antigo era apenas o ISO de timeCreated; tratamos como priority=false
  // (default histórico) para não duplicar/perder itens em chamadas em transição.
  const legacyDate = new Date(cursor)
  if (Number.isNaN(legacyDate.getTime())) return null
  return { priority: false, timeCreated: legacyDate }
}

/**
 * Ordenação explícita pedida pelo cliente (header clicável no ats).
 * Só campos do PRÓPRIO job: ordenar por contagem de candidatos exigiria
 * carregar entrevistas de todas as vagas, não só as da página.
 */
function sortJobsExplicit<
  T extends { jobName?: string | null; timeCreated?: Date | string | null },
>(jobs: T[], sortBy: 'name' | 'createdAt', sortDir: 'asc' | 'desc'): T[] {
  const factor = sortDir === 'asc' ? 1 : -1
  return [...jobs].sort((a, b) => {
    if (sortBy === 'name') {
      return factor * (a.jobName ?? '').localeCompare(b.jobName ?? '', 'pt-BR')
    }
    const at = a.timeCreated ? new Date(a.timeCreated).getTime() : 0
    const bt = b.timeCreated ? new Date(b.timeCreated).getTime() : 0
    return factor * (at - bt)
  })
}

function sortByPriorityThenTimeCreated<T extends { priority?: boolean | null; timeCreated?: Date | string | null }>(
  jobs: T[],
): T[] {
  return [...jobs].sort((a, b) => {
    const pa = a.priority === true ? 1 : 0
    const pb = b.priority === true ? 1 : 0
    if (pa !== pb) return pb - pa
    const ta = a.timeCreated ? new Date(a.timeCreated).getTime() : 0
    const tb = b.timeCreated ? new Date(b.timeCreated).getTime() : 0
    return tb - ta
  })
}

/**
 * Para paginação em memória no path Firestore: encontra o índice do item
 * seguinte ao cursor (priority + timeCreated) num array já ordenado.
 * Se não achar correspondência exata, retorna 0 (recomeça do início — degradação
 * graciosa pra cursores stale após mudança no dataset).
 */
function findFirestoreCursorOffset<T extends { priority?: boolean | null; timeCreated?: Date | string | null }>(
  sorted: T[],
  cursor: { priority: boolean; timeCreated: Date },
): number {
  const targetTime = cursor.timeCreated.getTime()
  const idx = sorted.findIndex((j) => {
    const p = j.priority === true
    if (p !== cursor.priority) return false
    const t = j.timeCreated ? new Date(j.timeCreated).getTime() : 0
    return t === targetTime
  })
  return idx >= 0 ? idx + 1 : 0
}

/** Extracts last segment from a Firestore-style path (e.g. "companies/abc/messages/xyz" → "xyz") */
function extractIdFromPath(path: string): string | undefined {
  return path.split('/').pop() || undefined
}

// ============================================================================
// FACTORY
// ============================================================================

export function createJobsService(infra: InfraProvider) {
  const antiGhostingSla = createAntiGhostingSlaService(infra)
  const taxonomy = createTaxonomyService(infra)

  /**
   * Ocupação canônica da vaga (V2-803).
   *
   * Não resolveu? Devolve objeto vazio — o campo simplesmente não é gravado, e
   * a vaga fica só com o texto. Gravar `null` explícito seria pior: um
   * reprocessamento com taxonomia nova não saberia distinguir "não casou" de
   * "nunca foi tentado".
   */
  async function resolveOccupationFields(
    jobName: string | undefined,
  ): Promise<Record<string, unknown>> {
    if (!jobName) return {}
    const match = await taxonomy.resolveOccupation(jobName).catch(() => null)
    if (!match) return {}
    return {
      occupationCode: match.occupation.id,
      taxonomyVersion: match.occupation.taxonomyVersion,
    }
  }

  // ─── Internal helpers that use infra ─────────────────────────────────────

  async function fetchJobsWithFiltersInternal(
    companyId: string,
    filters: JobFilters,
    candidatesLimit = 50,
    cursor?: string,
    limit?: number,
    page?: number
  ): Promise<JobsWithInterviews> {
    const decodedCursor = cursor ? decodeJobsCursor(cursor) : null

    // Estratégia limit + 1: buscar um job a mais para saber se tem próxima página
    const fetchLimit = limit ? limit + 1 : 13

    const queryFilters = buildJobFilters(filters)

    let jobs: PostJob[] = []
    /** Contagem real do filtro — disponível no Firestore (buffer em memória). */
    let totalFiltered: number | null = null

    if (infra.isFirestore) {
      // Firestore é schemaless: docs antigos não têm o campo `priority`, então
      // `orderBy('priority')` e `where('priority', '==', false)` os EXCLUEM.
      // Estratégia: buscar tudo (sem orderBy priority), tratar ausência como
      // false, e ordenar/filtrar/paginar em memória.
      const isPriorityFalseFilter = (f: QueryFilter) =>
        f.field === 'priority' && f.operator === '==' && f.value === false
      const firestoreFilters = queryFilters.filter((f) => !isPriorityFalseFilter(f))

      try {
        const buffer = (await infra.jobRepository.listJobs(companyId, {
          filters: firestoreFilters,
          orderByField: 'timeCreated',
          orderDirection: 'desc',
          limitTo: 500,
        })) as PostJob[]

        const filtered = queryFilters.some(isPriorityFalseFilter)
          ? buffer.filter((j) => j.priority !== true)
          : buffer

        const sorted =
          filters.sortBy && filters.sortBy !== 'default'
            ? sortJobsExplicit(filtered, filters.sortBy, filters.sortDir ?? 'desc')
            : sortByPriorityThenTimeCreated(filtered)

        // Paginação por offset em memória: cursor codifica o índice de início;
        // sem cursor, `page` dá navegação direta (o buffer já é a lista inteira).
        const startIndex = decodedCursor
          ? findFirestoreCursorOffset(sorted, decodedCursor)
          : Math.max(0, ((page ?? 1) - 1) * (limit ?? 12))
        jobs = sorted.slice(startIndex, startIndex + fetchLimit)
        // Total REAL do filtro (Firestore só; selfhosted segue sem contagem).
        totalFiltered = sorted.length
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        throw new BadRequestError(errorMessage)
      }
    } else {
      try {
        const explicitOrderBy =
          filters.sortBy && filters.sortBy !== 'default'
            ? [
                {
                  field: filters.sortBy === 'name' ? 'jobName' : 'timeCreated',
                  direction: filters.sortDir ?? 'desc',
                },
              ]
            : [
                { field: 'priority', direction: 'desc' as const },
                { field: 'timeCreated', direction: 'desc' as const },
              ]

        jobs = (await infra.jobRepository.listJobs(companyId, {
          filters: queryFilters,
          orderBy: explicitOrderBy,
          limitTo: fetchLimit,
          ...(decodedCursor && {
            startAfterCompoundCursor: [
              { field: 'priority', value: decodedCursor.priority, direction: 'desc' },
              { field: 'timeCreated', value: decodedCursor.timeCreated, direction: 'desc' },
            ],
          }),
        })) as PostJob[]
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        throw new BadRequestError(errorMessage)
      }
    }


    if (jobs.length === 0) {
      return {
        jobs: [],
        interviews: [],
        nextCursor: null,
        lastJobDate: null,
      }
    }

    // Buscar interviews por job usando a MESMA fonte que GET /companies/jobs/:jobId/candidates
    // (subcoleção postJob/{jobId}/interviews), evitando inconsistência com companyInterviews
    const jobIds = jobs.map((job) => job.id)
    const interviewResults = await Promise.all(
      jobIds.map((jobId) =>
        infra.candidateRepository.listJobInterviews(companyId, jobId, {
          filters: [{ field: 'finished', operator: '==', value: true }],
          orderByField: 'date',
          orderDirection: 'desc',
        }),
      ),
    )

    // Agrupar interviews por jobId (cada resultado já é o array daquele job)
    const interviewsByJobId = new Map<string, CompanyInterview[]>()
    for (let i = 0; i < jobIds.length; i++) {
      const jobId = jobIds[i]
      const jobInterviews = (interviewResults[i] ?? []) as CompanyInterview[]
      if (jobInterviews.length > 0) {
        interviewsByJobId.set(jobId, jobInterviews)
      }
    }

    const interviews = interviewResults.flat() as CompanyInterview[]

    // Processar jobs com suas interviews
    const processedJobs = jobs.map((job): ProcessedJob => {
      const jobInterviews = interviewsByJobId.get(job.id) || []
      const { usersApplied, totalCandidates, stageCounts, stageDays } = processJobCandidates(
        jobInterviews,
        candidatesLimit
      )

      return {
        ...job,
        uid: job?.uid?.id || null,
        timeCreated: toDate(job?.timeCreated),
        closingDate: toDate(job?.closingDate),
        infoJobs: job?.infoJobs?.id || null,
        usersApplied,
        totalCandidates,
        stageCounts,
        stageDays,
        slaIrregularSince: toDate(job?.slaIrregularSince),
        hiringIntent: job?.hiringIntent ?? null,
        freshnessSlaDays: job?.freshnessSlaDays ?? null,
        // ✅ Retornar null se não houver creatorName (frontend traduz)
        creatorName: job.creatorName || null,
      }
    })

    // Calcular cursor composto para próxima página (priority + timeCreated)
    const hasMoreData = jobs.length >= fetchLimit
    const lastJob = processedJobs.length > 0 ? processedJobs[processedJobs.length - 1] : null
    const currentLastJobDate = lastJob?.timeCreated ?? null

    const nextCursor =
      lastJob && currentLastJobDate && hasMoreData
        ? encodeJobsCursor(lastJob.priority === true, currentLastJobDate)
        : null

    return {
      jobs: processedJobs,
      interviews,
      nextCursor,
      lastJobDate: currentLastJobDate,
      totalFiltered,
    }
  }

  async function enrichJobsWithInterviewsInternal(
    companyId: string,
    jobs: PostJob[],
    candidatesLimit: number
  ): Promise<ProcessedJob[]> {
    if (jobs.length === 0) return []

    const jobIds = jobs.map((job) => job.id)
    const interviewResults = await Promise.all(
      jobIds.map((jobId) =>
        infra.candidateRepository.listJobInterviews(companyId, jobId, {
          filters: [
            {
              field: 'finished',
              operator: '==',
              value: true,
            },
          ],
          orderByField: 'date',
          orderDirection: 'desc',
        }),
      ),
    )

    const interviewsByJobId = new Map<string, CompanyInterview[]>()
    for (let i = 0; i < jobIds.length; i++) {
      const jobId = jobIds[i]
      const jobInterviews = (interviewResults[i] ?? []) as CompanyInterview[]
      if (jobInterviews.length > 0) {
        interviewsByJobId.set(jobId, jobInterviews)
      }
    }

    return jobs.map((job): ProcessedJob => {
      const jobInterviews = interviewsByJobId.get(job.id) || []
      const { usersApplied, totalCandidates, stageCounts, stageDays } = processJobCandidates(
        jobInterviews,
        candidatesLimit
      )

      return {
        ...job,
        uid: job?.uid?.id || null,
        timeCreated: toDate(job?.timeCreated),
        closingDate: toDate(job?.closingDate),
        infoJobs: job?.infoJobs?.id || null,
        usersApplied,
        totalCandidates,
        stageCounts,
        stageDays,
        slaIrregularSince: toDate(job?.slaIrregularSince),
        hiringIntent: job?.hiringIntent ?? null,
        freshnessSlaDays: job?.freshnessSlaDays ?? null,
        // ✅ Retornar null se não houver creatorName (frontend traduz)
        creatorName: job.creatorName || null,
      }
    })
  }

  async function searchJobsByTextInternal(
    companyId: string,
    searchTerm: string,
    filters: JobFilters,
    candidatesLimit: number,
    limit: number
  ): Promise<JobSearchResult> {
    const isNumeric = /^\d+$/.test(searchTerm)

    // CASO 1: Busca por identifier (numérico) - QUERY NATIVA com prefix match.
    // Vagas Gupy gravam identifier como "<jobId> - <code>", então busca exata
    // pelo jobId puro nunca casa. Range query simula startsWith(searchTerm).
    if (isNumeric) {
      // Para evitar exigência de índice composto novo (archived + stopped +
      // identifier), rodamos só a range query no identifier (single-field,
      // auto-indexado) e aplicamos os demais filtros em memória — identifier
      // é unique-ish por empresa, então o conjunto retornado é pequeno.
      const queryFilters: QueryFilter[] = []
      queryFilters.push({ field: 'identifier', operator: '>=', value: searchTerm })
      queryFilters.push({ field: 'identifier', operator: '<', value: `${searchTerm}\uf8ff` })

      const rawJobs = (await infra.jobRepository.listJobs(companyId, {
        filters: queryFilters,
        limitTo: 50,
      })) as PostJob[]

      const inMemoryFilters = buildJobFilters(filters)
      const jobs = rawJobs.filter((job) =>
        inMemoryFilters.every((f) => {
          if (f.operator !== '==') return true
          const fieldValue = (job as unknown as Record<string, unknown>)[f.field]
          return fieldValue === f.value
        }),
      )

      if (jobs.length > 0) {
        const enrichedJobs = await enrichJobsWithInterviewsInternal(
          companyId,
          jobs,
          candidatesLimit
        )

        return {
          jobs: sortByPriorityThenTimeCreated(enrichedJobs),
          nextCursor: null, // Busca por identifier não usa paginação
        }
      }

      // Se não encontrou por identifier, retornar vazio
      return {
        jobs: [],
        nextCursor: null,
      }
    }

    // CASO 2: Busca por jobName - EM MEMÓRIA (sem cursor pagination)
    const queryFilters = buildJobFilters(filters)

    // No Firestore docs antigos podem não ter o campo `priority`, então
    // evitamos orderBy/where('priority') na query e tratamos em memória abaixo.
    const isPriorityFalseFilter = (f: QueryFilter) =>
      f.field === 'priority' && f.operator === '==' && f.value === false
    const repoFilters = infra.isFirestore
      ? queryFilters.filter((f) => !isPriorityFalseFilter(f))
      : queryFilters

    const rawAllJobs = (await infra.jobRepository.listJobs(companyId, {
      filters: repoFilters,
      ...(infra.isFirestore
        ? { orderByField: 'timeCreated' as const, orderDirection: 'desc' as const }
        : {
            orderBy: [
              { field: 'priority', direction: 'desc' as const },
              { field: 'timeCreated', direction: 'desc' as const },
            ],
          }),
      limitTo: 500, // Limite razoável para busca por texto
    })) as PostJob[]

    const allJobs = infra.isFirestore && queryFilters.some(isPriorityFalseFilter)
      ? rawAllJobs.filter((j) => j.priority !== true)
      : rawAllJobs

    // Filtrar por jobName em memória
    const searchLower = searchTerm.toLowerCase()
    const matchingJobs = allJobs.filter((job) =>
      (job.jobName ?? '').toLowerCase().includes(searchLower)
    )

    // Enriquecer com interviews
    const enrichedJobs = sortByPriorityThenTimeCreated(
      await enrichJobsWithInterviewsInternal(companyId, matchingJobs, candidatesLimit),
    )

    // Aplicar paginação simples (não usa cursor)
    const hasMore = enrichedJobs.length > limit
    const jobsToReturn = hasMore ? enrichedJobs.slice(0, limit) : enrichedJobs

    return {
      jobs: jobsToReturn,
      nextCursor: null, // Busca por texto não usa cursor pagination
    }
  }

  async function fetchUserAndCompanyInternal(userId: string) {
    let usersDefault = false
    let user = (await infra.userRepository.getUsersCompany(userId)) as UsersCompany | null
    if (!user) {
      usersDefault = true
      user = (await infra.userRepository.getUser(userId)) as UsersCompany | null
      if (!user) {
        throw new BadRequestError('User not found')
      }
    }

    const companyId = getCompanyIdFromUser(user as unknown as { company?: string | { id?: string; _id?: unknown } })
    if (!companyId) {
      throw new BadRequestError(
        'Usuário sem empresa vinculada. Faça login novamente ou entre em contato com o suporte.'
      )
    }
    const company = await infra.companyRepository.getCompany(companyId)
    if (!company) {
      throw new BadRequestError(
        'Empresa não encontrada. Verifique se sua conta está vinculada à empresa correta ou entre em contato com o suporte.'
      )
    }
    const userWithCompany = { ...user, company: { id: companyId } } as UsersCompany
    return { user: userWithCompany, company, usersDefault }
  }

  async function resolveCompanyFromUserInternal(userId: string) {
    const user = (await infra.userRepository.getUsersCompany(userId)) as UsersCompany | null
    if (!user) {
      throw new BadRequestError('User not found')
    }
    const companyId = (user.company as { id?: string })?.id
    const company = companyId
      ? await infra.companyRepository.getCompany(companyId)
      : null
    if (!company) {
      throw new BadRequestError('Company not found')
    }
    return { user, company }
  }

  /** Upload base64 video to storage and return the URL */
  async function uploadBase64VideoInternal(
    companyId: string,
    infoJobsId: string,
    videoData: string,
    prefix: string,
  ): Promise<string> {
    const timestamp = Date.now()
    const filename = `${prefix}-${timestamp}.mp4`
    const base64Data = videoData.split(',')[1]
    const buffer = Buffer.from(base64Data, 'base64')
    const storagePath = `companies/${companyId}/info-jobs/${infoJobsId}`
    return infra.storage.uploadFile(buffer, storagePath, filename, 'video/mp4')
  }

  return {
    // ─── Queries ──────────────────────────────────────────────────────────────

    fetchJobsWithFilters: fetchJobsWithFiltersInternal,

    processJobsQuery: async function processJobsQueryInternal(
      companyId: string,
      filters: JobFilters,
      limit?: number,
      page?: number
    ): Promise<JobSearchResult> {
      const targetLimit = limit || 12

      // CASO 1: Busca por texto (identifier ou jobName)
      if (filters.find && filters.find.length >= 3) {
        return searchJobsByTextInternal(
          companyId,
          filters.find,
          filters,
          filters.candidatesLimit,
          targetLimit
        )
      }

      // CASO 2: Listagem com filtros e paginação via cursor
      const jobsData = await fetchJobsWithFiltersInternal(
        companyId,
        filters,
        filters.candidatesLimit,
        filters.cursor,
        targetLimit,
        page
      )

      // Remover o job extra se existir (estratégia limit + 1)
      const hasMore = jobsData.jobs.length > targetLimit
      const jobsToReturn = hasMore
        ? jobsData.jobs.slice(0, targetLimit)
        : jobsData.jobs

      return {
        jobs: jobsToReturn,
        nextCursor: jobsData.nextCursor,
        totalFiltered: jobsData.totalFiltered ?? null,
      }
    },

    // ─── Mutations ────────────────────────────────────────────────────────────

    /**
     * Create a new job post.
     * Absorbs logic from create-job.ts: user/company resolution, data prep, defaults, slug, interviewWhatsapp.
     */
    async createJob(userId: string, data: Record<string, unknown>): Promise<{ jobId: string; companyId: string }> {
      const { user, company } = await fetchUserAndCompanyInternal(userId)
      const companyId = company.id

      // Validate infoJobsId if provided
      let infoJobsId: string | undefined
      if (data.infoJobsId) {
        const infoJobsDoc = await infra.jobRepository.getInfoJob(companyId, data.infoJobsId as string)
        if (!infoJobsDoc) {
          throw new BadRequestError(
            `InfoJobs with ID "${data.infoJobsId}" not found for company "${company.companyName}" (${companyId})`
          )
        }
        infoJobsId = data.infoJobsId as string
      }

      // Extract notification message ID from path
      let notificationMessageId: string | undefined
      if (data.uid_notification_message) {
        notificationMessageId = extractIdFromPath(data.uid_notification_message as string)
      }

      // Build job data with defaults
      // Anti-ghosting (TOS-026): default true + SLA 24h só em vagas NOVAS (sem backfill).
      const antiGhostingEnabled =
        data.antiGhostingEnabled !== undefined
          ? data.antiGhostingEnabled
          : ANTI_GHOSTING_CONFIG.defaultAntiGhostingEnabled
      const feedbackSlaHours =
        data.feedbackSlaHours !== undefined
          ? data.feedbackSlaHours
          : ANTI_GHOSTING_CONFIG.defaultFeedbackSlaHours

      const jobDataRaw: Record<string, unknown> = {
        ...data,
        timeCreated: new Date(),
        stopped: false,
        archived: false,
        usersApplied: [],
        companyName: company.companyName,
        creatorId: userId,
        creatorName:
          user.display_name ||
          (user.email as string)?.split('@')[0] ||
          'Nome não informado',
        creatorEmail: user.email,
        antiGhostingEnabled,
        feedbackSlaHours,
        // taxonomia (V2-803): resolvida AO LADO do texto, nunca no lugar dele
        ...(await resolveOccupationFields(data.jobName as string | undefined)),
        ...(infoJobsId !== undefined && { infoJobs: infoJobsId }),
        ...(notificationMessageId !== undefined && {
          uid_notification_message: notificationMessageId,
        }),
      }

      delete jobDataRaw.infoJobsId
      if (!notificationMessageId) {
        delete jobDataRaw.uid_notification_message
      }

      const jobData = removeUndefinedFields(jobDataRaw)
      const jobSlug = generateSlug(data.jobName as string)
      const docRef = await infra.jobRepository.createJob(companyId, jobData, jobSlug)

      if (data.typeInterview === 'whatsapp') {
        await infra.jobRepository.createInterviewWhatsapp({
          jobId: docRef.id,
          companyId,
        }, docRef.id)
      }

      return { jobId: docRef.id, companyId }
    },

    /**
     * Full update of a job post (PUT).
     * Absorbs logic from update-job.ts: user/company resolution, infoJobsId validation, identifier gen.
     */
    async updateJob(userId: string, jobId: string, data: Record<string, unknown>): Promise<void> {
      const { company } = await resolveCompanyFromUserInternal(userId)

      // Verify job exists
      const jobDoc = await infra.jobRepository.getJob(company.id, jobId)
      if (!jobDoc) {
        throw new BadRequestError('Job not found')
      }

      await antiGhostingSla.assertCanPublishOrUnstop({
        companyId: company.id,
        company,
        job: jobDoc,
        wantsPublic: data.public === true,
        wantsUnstop: data.stopped === false,
      })

      // Validate infoJobsId if provided
      let infoJobsId: string | undefined
      if (data.infoJobsId) {
        const infoJobsDoc = await infra.jobRepository.getInfoJob(company.id, data.infoJobsId as string)
        if (!infoJobsDoc) {
          throw new BadRequestError('InfoJobs not found')
        }
        infoJobsId = data.infoJobsId as string
      }

      const updateData: Record<string, unknown> = {
        ...data,
        companyName: company.companyName,
        identifier: `${company.id}-${Date.now()}`,
        ...(infoJobsId !== undefined && { infoJobs: infoJobsId }),
      }

      delete updateData.infoJobsId

      const finalUpdateData = removeUndefinedFields(updateData)
      await infra.jobRepository.updateJob(company.id, jobId, finalUpdateData)
    },

    /**
     * Partial update of a job post (PATCH).
     * Absorbs logic from patch-job.ts: infoJobsId validation, notification message normalization.
     */
    async patchJob(userId: string, jobId: string, data: Record<string, unknown>): Promise<void> {
      const { company } = await resolveCompanyFromUserInternal(userId)

      // Verify job exists
      const jobDoc = await infra.jobRepository.getJob(company.id, jobId)
      if (!jobDoc) {
        throw new BadRequestError('Job not found')
      }

      await antiGhostingSla.assertCanPublishOrUnstop({
        companyId: company.id,
        company,
        job: jobDoc,
        wantsPublic: data.public === true,
        wantsUnstop: data.stopped === false,
      })

      const updateData: Record<string, unknown> = { ...data }

      if (data.infoJobsId) {
        const infoJobsDoc = await infra.jobRepository.getInfoJob(company.id, data.infoJobsId as string)
        if (!infoJobsDoc) {
          throw new BadRequestError('InfoJobs not found')
        }
        updateData.infoJobs = data.infoJobsId
        delete updateData.infoJobsId
      }

      if (data.uid_notification_message && typeof data.uid_notification_message === 'string') {
        const messageId = extractIdFromPath(data.uid_notification_message)
        if (messageId) {
          updateData.uid_notification_message = messageId
        }
      }

      const finalUpdateData = removeUndefinedFields(updateData)
      await infra.jobRepository.updateJob(company.id, jobId, finalUpdateData)
    },

    /**
     * Delete a job post.
     */
    async deleteJob(companyId: string, jobId: string): Promise<void> {
      const jobDoc = await infra.jobRepository.getJob(companyId, jobId)
      if (!jobDoc) {
        throw new BadRequestError('Job not found')
      }
      await infra.jobRepository.deleteJob(companyId, jobId)
    },

    // ─── InfoJobs ───────────────────────────────────────────────────────────────

    /**
     * Create a new info job with optional base64 video upload.
     * Absorbs logic from create-info-jobs.ts.
     */
    async createInfoJob(
      companyId: string,
      data: { name: string; finishText: string; finishVideo: string; welcomeText: string; welcomeVideo: string },
    ): Promise<{ infoJobsId: string }> {
      const infoJobsData: Record<string, unknown> = { ...data }
      const infoJobsId = crypto.randomUUID()

      // Upload welcome video if base64
      if (typeof data.welcomeVideo === 'string' && data.welcomeVideo.startsWith('data:video')) {
        try {
          infoJobsData.welcomeVideo = await uploadBase64VideoInternal(companyId, infoJobsId, data.welcomeVideo, 'welcome')
        } catch (error) {
          throw new BadRequestError(error as string)
        }
      }

      // Upload finish video if base64
      if (typeof data.finishVideo === 'string' && data.finishVideo.startsWith('data:video')) {
        try {
          infoJobsData.finishVideo = await uploadBase64VideoInternal(companyId, infoJobsId, data.finishVideo, 'finish')
        } catch (error) {
          throw new BadRequestError(error as string)
        }
      }

      const doc = await infra.jobRepository.createInfoJob(companyId, infoJobsData, infoJobsId)
      return { infoJobsId: doc.id }
    },

    /**
     * Full update of an info job (PUT).
     * NOTE: Fixes bug from original update-info-jobs.ts where welcomeText/welcomeVideo
     * were incorrectly transformed to Date objects.
     */
    async updateInfoJob(companyId: string, infoJobsId: string, data: Record<string, unknown>): Promise<void> {
      const infoJobsDoc = await infra.jobRepository.getInfoJob(companyId, infoJobsId)
      if (!infoJobsDoc) {
        throw new BadRequestError('InfoJobs not found')
      }
      await infra.jobRepository.updateInfoJob(companyId, infoJobsId, data)
    },

    /**
     * Partial update of an info job (PATCH) with optional base64 video upload.
     * Absorbs logic from patch-info-jobs.ts.
     */
    async patchInfoJob(companyId: string, infoJobsId: string, data: Record<string, unknown>): Promise<void> {
      const infoJobsDoc = await infra.jobRepository.getInfoJob(companyId, infoJobsId)
      if (!infoJobsDoc) {
        throw new BadRequestError('InfoJobs not found')
      }

      const updateData: Record<string, unknown> = { ...data }

      // Upload welcome video if base64
      if (typeof updateData.welcomeVideo === 'string' && updateData.welcomeVideo.startsWith('data:video')) {
        try {
          updateData.welcomeVideo = await uploadBase64VideoInternal(companyId, infoJobsId, updateData.welcomeVideo, 'welcome')
        } catch (error) {
          throw new BadRequestError(error as string)
        }
      }

      // Upload finish video if base64
      if (typeof updateData.finishVideo === 'string' && updateData.finishVideo.startsWith('data:video')) {
        try {
          updateData.finishVideo = await uploadBase64VideoInternal(companyId, infoJobsId, updateData.finishVideo, 'finish')
        } catch (error) {
          throw new BadRequestError(error as string)
        }
      }

      await infra.jobRepository.updateInfoJob(companyId, infoJobsId, updateData)
    },

    /**
     * Delete an info job.
     */
    async deleteInfoJob(companyId: string, infoJobsId: string): Promise<void> {
      const infoJobsDoc = await infra.jobRepository.getInfoJob(companyId, infoJobsId)
      if (!infoJobsDoc) {
        throw new BadRequestError('InfoJobs not found')
      }
      await infra.jobRepository.deleteInfoJob(companyId, infoJobsId)
    },
    // ─── Direct repository accessors (for route migration) ───────────────────

    async getJob(companyId: string, jobId: string) {
      return infra.jobRepository.getJob(companyId, jobId)
    },

    async listJobs(companyId: string, options?: Parameters<typeof infra.jobRepository.listJobs>[1]) {
      return infra.jobRepository.listJobs(companyId, options)
    },

    async getInfoJob(companyId: string, infoJobId: string) {
      return infra.jobRepository.getInfoJob(companyId, infoJobId)
    },

    async listInfoJobs(companyId: string) {
      return infra.jobRepository.listInfoJobs(companyId)
    },

    async listJobInterviews(companyId: string, jobId: string, options?: Parameters<typeof infra.candidateRepository.listJobInterviews>[2]) {
      return infra.candidateRepository.listJobInterviews(companyId, jobId, options)
    },

    async listCompanyInterviews(companyId: string, options?: Parameters<typeof infra.candidateRepository.listCompanyInterviews>[1]) {
      return infra.candidateRepository.listCompanyInterviews(companyId, options)
    },

    async getJobApplied(userId: string, jobAppliedId: string) {
      return infra.candidateRepository.getJobApplied(userId, jobAppliedId)
    },

    async getUsersCompany(userId: string) {
      return infra.userRepository.getUsersCompany(userId)
    },
  }
}

