import {
	CandidateStatus,
	DataRange,
	InterviewCount,
} from '@/http/constants/candidate-filters'
import type { InfraProvider } from '@coploy/infra'
import type { Company, ListOptions, QueryFilter, CompanyInterview } from '@coploy/domain'
import type {
	Candidate,
	CandidateFilters,
	CandidateFiltersWithDateLimit,
	CandidateSearchResult,
} from '@/types/candidates-ranking'
import { createCompanyCreditsService } from '@/lib/services/company-credits'
import { isCourtesyInterview } from '@/lib/saas-courtesy'
import { interviewInScope } from '@/lib/access-scope'

export interface RankingMaskContext {
	paidKeys: Set<string>
	subscriptionTrialStartAt: Date | null
}

function isScoreVisible(
	userRefId: string | null | undefined,
	jobAppliedId: string | null | undefined,
	interviewDate: Date | string | null | undefined,
	ctx: RankingMaskContext | null,
): boolean {
	if (!ctx) return true
	if (!userRefId || !jobAppliedId) return false
	if (ctx.paidKeys.has(`${userRefId}::${jobAppliedId}`)) return true
	return isCourtesyInterview(
		{ subscriptionTrial: { startAt: ctx.subscriptionTrialStartAt } },
		interviewDate,
	)
}

const BATCH_SIZE = 1500 // Aumentado de 500 para 1500 para busca mais profunda

export function getDateRangeFilter(range: string): Date {
	const now = new Date()
	switch (range) {
		case DataRange.LAST_WEEK:
			return new Date(now.setDate(now.getDate() - 7))
		case DataRange.LAST_MONTH:
			return new Date(now.setMonth(now.getMonth() - 1))
		case DataRange.LAST_3_MONTHS:
			return new Date(now.setMonth(now.getMonth() - 3))
		default:
			return new Date(0)
	}
}

function applyCandidateFilters(
	candidates: Candidate[],
	filters: CandidateFiltersWithDateLimit,
): Candidate[] {
	let filteredCandidates = candidates

	if (filters.status !== CandidateStatus.ALL) {
		filteredCandidates = filteredCandidates.filter(
			(candidate) => candidate.status === filters.status,
		)
	}

	if (filters.dataRange !== DataRange.ALL) {
		filteredCandidates = filteredCandidates.filter(
			(candidate) =>
				candidate.lastInterview && candidate.lastInterview >= filters.dateLimit,
		)
	}

	if (filters.interviewCount !== InterviewCount.ALL) {
		filteredCandidates = filteredCandidates.filter((candidate) => {
			// Usar interviews para contar TODAS as entrevistas finalizadas
			switch (filters.interviewCount) {
				case InterviewCount.AT_LEAST_ONE:
					return candidate.interviews === 1
				case InterviewCount.MORE_THAN_ONE:
					return candidate.interviews > 1
				default:
					return true
			}
		})
	}

	if (filters.score !== undefined) {
		const scoreMin = Math.floor(filters.score)
		const scoreMax = Math.floor(filters.score) + 0.99
		filteredCandidates = filteredCandidates.filter(
			(candidate) =>
				candidate.averageScore !== null &&
				candidate.averageScore >= scoreMin &&
				candidate.averageScore <= scoreMax,
		)
	}

	if (filters.find) {
		const searchLower = filters.find.toLowerCase()
		filteredCandidates = filteredCandidates.filter(
			(candidate) =>
				candidate.name.toLowerCase().includes(searchLower) ||
				candidate.email.toLowerCase().includes(searchLower) ||
				String(candidate.averageScore ?? '').includes(searchLower),
		)
	}

	if (filters.jobId) {
		filteredCandidates = filteredCandidates.filter((candidate) =>
			(candidate.jobsApplied ?? []).some(
				(j: any) =>
					j?.jobApplied?.id === filters.jobId ||
					j?.jobApplied === filters.jobId ||
					j?.jobId === filters.jobId,
			),
		)
	}

	return filteredCandidates
}

export function processCandidatesMap(
	candidatesMap: Map<string, Candidate>,
	filters: CandidateFiltersWithDateLimit,
): Candidate[] {
	const candidates = Array.from(candidatesMap.values())
	const filteredCandidates = applyCandidateFilters(candidates, filters)

	// Ordenar por média (maior para menor). Null-safe: averageScore=null vai pro fim.
	return filteredCandidates.sort((a, b) => {
		const aScore = a.averageScore ?? Number.NEGATIVE_INFINITY
		const bScore = b.averageScore ?? Number.NEGATIVE_INFINITY
		return bScore - aScore
	})
}

function buildQueryFilters(status: string): QueryFilter[] {
	const queryFilters: QueryFilter[] = [
		{
			field: 'finished',
			operator: '==',
			value: true,
		},
	]

	return queryFilters
}

function toDate(raw: unknown): Date | null {
	if (raw instanceof Date) return raw
	if (raw && typeof (raw as { toDate?: unknown }).toDate === 'function') {
		return (raw as { toDate: () => Date }).toDate()
	}
	return null
}

function normalizeCandidateIdentity(value: string | null | undefined) {
	return value?.trim().toLowerCase() || ''
}

function getCompanyInterviewKey(interview: CompanyInterview) {
	return (
		interview.id ||
		interview.job_applied_ref?.path ||
		`${interview.email || 'unknown-email'}::${interview.name || 'unknown-name'}::${String(interview.date || '')}`
	)
}

function dedupeCompanyInterviews(interviews: CompanyInterview[]) {
	const map = new Map<string, CompanyInterview>()

	for (const interview of interviews) {
		map.set(getCompanyInterviewKey(interview), interview)
	}

	return Array.from(map.values())
}

function updateCandidateFromInterview(
	candidatesMap: Map<string, Candidate>,
	interview: CompanyInterview,
): void {
	const key = `${interview.email}-${interview.name}`
	const existing = candidatesMap.get(key)

	const isScorableInterview =
		interview.typeInterview === 'interview' ||
		interview.typeInterview === 'evaluation'

	const numericScore = Number(interview.score) || 0
	const userRefId = interview.user_ref?.id || null
	const jobAppliedId = interview.job_applied_ref?.id || null
	const interviewDate = toDate(interview.date)

	if (existing) {
		existing.interviews += 1

		if (isScorableInterview && Number.isFinite(numericScore)) {
			const previousValidInterviews = existing.validInterviewsCount || 0
			const previousAvg = existing.averageScore ?? 0

			if (previousValidInterviews === 0) {
				existing.averageScore = numericScore
				existing.validInterviewsCount = 1
			} else {
				const newValidInterviewsCount = previousValidInterviews + 1
				existing.averageScore =
					(previousAvg * previousValidInterviews + numericScore) /
					newValidInterviewsCount
				existing.validInterviewsCount = newValidInterviewsCount
			}

			if (userRefId && jobAppliedId) {
				if (!existing.scorableInterviews) existing.scorableInterviews = []
				existing.scorableInterviews.push({ userRefId, jobAppliedId, score: numericScore, date: interviewDate })
			}
		}

		if (
			interviewDate &&
			(!existing.lastInterview || interviewDate > existing.lastInterview)
		) {
			existing.lastInterview = interviewDate
		}
		existing.status = interview.candidateStatus || null

		if (interview.user_ref?.id && !existing.userId) {
			existing.userId = interview.user_ref.id
		}
	} else {
		const scorableInterviews =
			isScorableInterview && userRefId && jobAppliedId && Number.isFinite(numericScore)
				? [{ userRefId, jobAppliedId, score: numericScore, date: interviewDate }]
				: []
		candidatesMap.set(key, {
			name: interview.name ?? '',
			email: interview.email ?? '',
			photo_url: interview.photo_url || '',
			interviews: 1,
			averageScore: isScorableInterview ? numericScore : 0,
			lastInterview: interviewDate,
			status: interview.candidateStatus || null,
			userId: interview.user_ref?.id || null,
			validInterviewsCount: isScorableInterview ? 1 : 0,
			scorableInterviews,
		})
	}
}

// Helper para processar candidatos com filtros
function processCandidatesWithFilters(
	candidatesMap: Map<string, Candidate>,
	filters: CandidateFilters,
	dateLimit: Date | null,
): Candidate[] {
	return processCandidatesMap(candidatesMap, {
		...filters,
		dateLimit: dateLimit || new Date(0),
	})
}

export function createCandidatesRankingService(infra: InfraProvider) {
	const companyCreditsService = createCompanyCreditsService(infra)

	async function buildRankingMaskContext(
		companyId: string,
		candidates: Candidate[],
	): Promise<RankingMaskContext> {
		// Janela de cortesia SaaS: entrevistas finalizadas ANTES de
		// `company.subscriptionTrial.startAt` permanecem com score visível.
		let subscriptionTrialStartAt: Date | null = null
		try {
			const company = (await infra.companyRepository.getCompany(
				companyId,
			)) as Company | null
			const raw = company?.subscriptionTrial?.startAt
			if (raw) {
				const parsed = raw instanceof Date ? raw : new Date(raw as unknown as string | number)
				subscriptionTrialStartAt = Number.isNaN(parsed.getTime()) ? null : parsed
			}
		} catch (err) {
			console.warn('[CandidatesRanking] Falha ao ler company doc do viewer:', err)
		}

		// Pares (userId, jobAppliedId) p/ checar créditos consumidos.
		const pairs: { id: string; jobApplied: string }[] = []
		const seen = new Set<string>()
		for (const c of candidates) {
			for (const s of c.scorableInterviews ?? []) {
				const k = `${s.userRefId}::${s.jobAppliedId}`
				if (seen.has(k)) continue
				seen.add(k)
				pairs.push({ id: s.userRefId, jobApplied: s.jobAppliedId })
			}
		}

		const paidKeys = new Set<string>()
		if (pairs.length > 0) {
			try {
				const paid = await companyCreditsService.getPaidUserIdsForCandidates(
					companyId,
					pairs,
				)
				for (const r of paid) paidKeys.add(`${r.id}::${r.jobApplied}`)
			} catch (err) {
				console.warn('[CandidatesRanking] Falha ao buscar créditos pagos:', err)
			}
		}

		return { paidKeys, subscriptionTrialStartAt }
	}

	function applyAverageScoreMask(
		candidates: Candidate[],
		ctx: RankingMaskContext,
	): Candidate[] {
		return candidates.map((c) => {
			const scorables = c.scorableInterviews ?? []
			if (scorables.length === 0) {
				// Sem entrevistas escoráveis (typeInterview != interview/evaluation):
				// não há score real a exibir, mas também não há nada a "esconder".
				return { ...c, averageScore: null, masked: false }
			}
			const visible = scorables.filter((s) =>
				isScoreVisible(s.userRefId, s.jobAppliedId, s.date, ctx),
			)
			if (visible.length === 0) {
				return { ...c, averageScore: null, masked: true }
			}
			const avg =
				visible.reduce((sum, s) => sum + s.score, 0) / visible.length
			return { ...c, averageScore: avg, masked: false }
		})
	}

	// Busca progressiva em batches para queries com texto
	async function fetchInterviewsWithTextSearchProgressive(
		companyId: string,
		filters: CandidateFilters,
		searchTerm: string,
		targetLimit: number,
		cursor?: string,
	): Promise<{
		interviews: CompanyInterview[]
		nextCursor: string | null
		hasMore: boolean
	}> {
		const maxBatches = 20 // Máximo 20 batches (aumentado de 10 para busca mais profunda)
		let allInterviews: CompanyInterview[] = []
		let currentCursor: string | null = cursor || null
		let batchCount = 0
		let hasMoreData = true

		// Buscar em batches até ter interviews suficientes
		while (
			allInterviews.length <= targetLimit &&
			hasMoreData &&
			batchCount < maxBatches
		) {
			batchCount++

			let lastInterviewDate: Date | null = null
			if (currentCursor) {
				try {
					lastInterviewDate = new Date(currentCursor)
					if (Number.isNaN(lastInterviewDate.getTime())) {
						lastInterviewDate = null
					}
				} catch {
					lastInterviewDate = null
				}
			}

			const batchOptions: ListOptions = {
				orderByField: 'date',
				orderDirection: 'desc',
				limitTo: BATCH_SIZE,
				filters: buildQueryFilters(filters.status),
				...(lastInterviewDate && { startAfterCursor: lastInterviewDate }),
			}

			const todasDoLote =
				await infra.candidateRepository.listCompanyInterviews(
					companyId,
					batchOptions,
				) as CompanyInterview[]

			/*
			 * Mesmo cuidado do laço sem busca: o RECORTE não pode encolher o lote
			 * que a paginação enxerga. `todasDoLote` continua mandando no cursor e
			 * no "tem mais dados"; o alcance entra só no que vira resultado —
			 * senão um lote sem nada do recrutador encerraria a busca cedo.
			 */
			const filteredBatch = dentroDoAlcance(todasDoLote, filters.jobIdsInScope).filter((interview) => {
				const nameMatch = interview.name?.toLowerCase().includes(searchTerm)
				const emailMatch = interview.email?.toLowerCase().includes(searchTerm)
				return nameMatch || emailMatch
			})

			allInterviews = [...allInterviews, ...filteredBatch]

			// Atualizar cursor — pelo lote CRU, não pelo recortado
			if (todasDoLote.length > 0) {
				const lastInterview = todasDoLote[todasDoLote.length - 1]
				const rawLastDate = lastInterview.date
				const lastDate = rawLastDate
					? typeof (rawLastDate as { toDate?: () => Date }).toDate === 'function'
						? (rawLastDate as unknown as { toDate: () => Date }).toDate()
						: new Date(rawLastDate as unknown as string | number | Date)
					: null
				currentCursor = lastDate ? lastDate.toISOString() : null
			}

			// Verificar se tem mais dados
			hasMoreData = todasDoLote.length >= BATCH_SIZE

			// Se já encontrou interviews suficientes, parar
			if (allInterviews.length > targetLimit) {
				break
			}
		}

		// Estratégia limit + 1: se tem mais que targetLimit, tem próxima página
		const finalHasMore = allInterviews.length > targetLimit || hasMoreData
		const finalNextCursor =
			allInterviews.length > 0 && finalHasMore ? currentCursor : null

		return {
			interviews: allInterviews,
			nextCursor: finalNextCursor,
			hasMore: finalHasMore,
		}
	}

	async function fetchInterviewBatch(
		companyId: string,
		filters: CandidateFilters,
		shouldUseLimit: boolean,
		lastInterviewDate?: Date | null,
	): Promise<CompanyInterview[]> {
		const batchOptions: ListOptions = {
			filters: buildQueryFilters(filters.status),
			orderByField: 'date',
			orderDirection: 'desc',
			...(shouldUseLimit && { limitTo: BATCH_SIZE }),
			// Adicionar cursor se fornecido
			...(lastInterviewDate && { startAfterCursor: lastInterviewDate }),
		}

		/*
		 * Devolve o lote CRU, de propósito.
		 *
		 * O recorte por alcance NÃO pode acontecer aqui: quem chama usa o tamanho
		 * do lote para saber se há mais dados e a data do último item como
		 * cursor. Filtrando antes, um lote sem nada do recrutador voltava vazio e
		 * o laço concluía "acabaram os dados" — a entrevista dele, algumas
		 * páginas adiante, nunca era alcançada. Foi o que fez o candidato sumir
		 * da tela de quem criou a vaga.
		 *
		 * O recorte é aplicado no CONSUMO (ver `dentroDoAlcance`).
		 */
		return (await infra.candidateRepository.listCompanyInterviews(
			companyId,
			batchOptions,
		)) as CompanyInterview[]
	}

	/** Entrevistas das vagas que a sessão alcança. `null` no filtro = todas. */
	function dentroDoAlcance(
		interviews: CompanyInterview[],
		jobIdsInScope: Set<string> | null | undefined,
	): CompanyInterview[] {
		if (!jobIdsInScope) return interviews
		return interviews.filter((interview) => interviewInScope(interview, jobIdsInScope))
	}

	// Helper para lidar com busca por texto (estratégia limit + 1)
	async function handleTextSearch(
		companyId: string,
		filters: CandidateFilters,
		candidatesMap: Map<string, Candidate>,
		dateLimit: Date | null,
		pageLimit: number,
		isEnterprise: boolean,
	): Promise<CandidateSearchResult> {
		const searchTerm = filters.find!.toLowerCase().trim()
		const targetLimit = pageLimit // Buscar pageLimit candidatos únicos

		// Busca progressiva com limit + 1
		const { interviews: filteredInterviews, nextCursor } =
			await fetchInterviewsWithTextSearchProgressive(
				companyId,
				filters,
				searchTerm,
				targetLimit * 5, // Buscar mais interviews para garantir candidatos suficientes (aumentado de 3 para 5)
				filters.cursor,
			)

		const processedInterviewIds = new Set<string>()

		for (const interview of filteredInterviews) {
			if (!processedInterviewIds.has(interview.id)) {
				processedInterviewIds.add(interview.id)
				updateCandidateFromInterview(candidatesMap, interview)
			}
		}

		let maskContext: RankingMaskContext | null = null
		if (!isEnterprise) {
			const allCandidates = Array.from(candidatesMap.values())
			maskContext = await buildRankingMaskContext(companyId, allCandidates)
			const masked = applyAverageScoreMask(allCandidates, maskContext)
			candidatesMap.clear()
			for (const c of masked) {
				candidatesMap.set(`${c.email}-${c.name}`, c)
			}
		}

		const finalCandidates = processCandidatesWithFilters(
			candidatesMap,
			filters,
			dateLimit,
		)

		// Estratégia limit + 1: se tem mais que pageLimit, tem próxima página
		const hasMore = finalCandidates.length > pageLimit

		return {
			candidates: finalCandidates,
			hasMore,
			totalProcessed: candidatesMap.size,
			nextCursor,
			lastInterviewDate: null,
			maskContext,
		}
	}

	return {
		async fetchCandidatesInBatches(
			companyId: string,
			_targetPage: number,
			pageLimit: number,
			filters: CandidateFilters,
			isEnterprise: boolean = true,
		): Promise<CandidateSearchResult> {
			const candidatesMap = new Map<string, Candidate>()
			const dateLimit = getDateRangeFilter(filters.dataRange)

			// Lidar com busca por texto usando estratégia progressiva
			if (filters.find && filters.find.length >= 3) {
				return await handleTextSearch(
					companyId,
					filters,
					candidatesMap,
					dateLimit,
					pageLimit,
					isEnterprise,
				)
			}

			// Para candidatos sem filtro de texto, buscar TODOS e ordenar por score
			// Cursor não funciona aqui pois a ordenação é por SCORE, não por DATA
			let hasMoreData = true
			let batchCount = 0
			const maxBatches = 20
			const processedInterviewIds = new Set<string>()
			let lastInterviewDate: Date | null = null

			while (hasMoreData && batchCount < maxBatches) {
				batchCount++

				try {
					const interviews = await fetchInterviewBatch(
						companyId,
						filters,
						true, // Sempre usar limite
						lastInterviewDate, // Buscar próximo batch sequencialmente
					)

					if (interviews.length === 0) {
						hasMoreData = false
						break
					}

					if (interviews.length < BATCH_SIZE) {
						hasMoreData = false
					}

					for (const interview of interviews) {
						// Evitar processar a mesma entrevista múltiplas vezes
						if (!processedInterviewIds.has(interview.id)) {
							processedInterviewIds.add(interview.id)
							// o recorte entra AQUI, no consumo: a paginação acima
							// continua enxergando o lote inteiro
							if (dentroDoAlcance([interview], filters.jobIdsInScope).length > 0) {
								updateCandidateFromInterview(candidatesMap, interview)
							}

						// Capturar a data da última entrevista para próximo batch
						const rawDate = interview.date
						const interviewDate = rawDate
							? typeof (rawDate as { toDate?: () => Date }).toDate === 'function'
								? (rawDate as unknown as { toDate: () => Date }).toDate()
								: new Date(rawDate as unknown as string | number | Date)
							: null
							if (
								interviewDate &&
								(!lastInterviewDate || interviewDate < lastInterviewDate)
							) {
								lastInterviewDate = interviewDate
							}
						}
					}
				} catch (err) {
					console.error('[CandidatesRanking] Batch fetch error:', err)
					hasMoreData = false
				}
			}

			// Aplicar mask de score para SaaS não-enterprise ANTES de filtrar/ordenar,
			// para que o ranking reflita apenas scores visíveis.
			let maskContext: RankingMaskContext | null = null
			if (!isEnterprise) {
				const allRaw = Array.from(candidatesMap.values())
				maskContext = await buildRankingMaskContext(companyId, allRaw)
				const masked = applyAverageScoreMask(allRaw, maskContext)
				candidatesMap.clear()
				for (const c of masked) {
					candidatesMap.set(`${c.email}-${c.name}`, c)
				}
			}

			// Processar TODOS os candidatos e ordenar por score
			const allCandidates = processCandidatesWithFilters(
				candidatesMap,
				filters,
				dateLimit,
			)

			// Retornar TODOS os candidatos (paginação feita no route handler)
			// nextCursor não é usado pois paginação é em memória
			return {
				candidates: allCandidates,
				hasMore: false, // hasMore será calculado no route handler
				totalProcessed: candidatesMap.size,
				nextCursor: null, // Não usar cursor para ordenação por score
				lastInterviewDate,
				maskContext,
			}
		},

		async enrichCandidatesWithJobs(
			candidates: Candidate[],
			companyId: string,
			maskContext: RankingMaskContext | null = null,
			/**
			 * Vagas alcançadas pela sessão. Sem isto, o card do candidato listaria
			 * "também se candidatou a <vaga de outra pessoa>" — devolvendo pelo
			 * detalhe o nome da vaga que a lista escondeu.
			 */
			jobIdsInScope: Set<string> | null = null,
		): Promise<Candidate[]> {
			return Promise.all(
				candidates.map(async (candidate) => {
					if (!candidate.userId && !candidate.email) {
						return { ...candidate, jobsApplied: [] }
					}

					try {
						let rawInterviews = candidate.email
							? (await infra.candidateRepository.listCompanyInterviews(companyId, {
									filters: [{ field: 'email', operator: '==', value: candidate.email }],
								}) as CompanyInterview[])
							: []

						if (rawInterviews.length === 0 && candidate.userId) {
							rawInterviews = await infra.candidateRepository.listCompanyInterviews(companyId, {
								filters: [
									{ field: 'user_ref.id', operator: '==', value: candidate.userId },
									{ field: 'finished', operator: '==', value: true },
								],
							}) as CompanyInterview[]
						}

						const normalizedName = normalizeCandidateIdentity(candidate.name)
						const companyInterviews = dedupeCompanyInterviews(
							rawInterviews.filter((interview) => {
								if (!interviewInScope(interview, jobIdsInScope)) return false
								if (!interview.finished) return false
								if (!normalizedName) return true

								return normalizeCandidateIdentity(interview.name) === normalizedName
							}),
						)

						const jobsApplied = companyInterviews.map((interview) => {
							const userApplied =
								interview.user_ref?.id || candidate.userId || null
							const jobAppliedId =
								interview.job_applied_ref?.id || interview.id
							// SaaS non-enterprise: mascara score por-entrevista se não há
							// crédito consumido nem cai na janela de cortesia SaaS
							// (data < subscriptionTrial.startAt).
							const visible = isScoreVisible(
								userApplied,
								interview.job_applied_ref?.id || null,
								toDate(interview.date),
								maskContext,
							)
							const rawScore = interview.score ?? null
							return {
								id: jobAppliedId,
								appliedTime: toDate(interview.date)?.toISOString() || null,
								companyOwner: companyId,
								userApplied,
								jobApplied: interview.job_ref?.id || null,
								finished: true,
								candidateStatus: interview.candidateStatus || null,
								typeInterview: interview.typeInterview || null,
								batchProcessing: null,
								interview: {
									id: interview.id,
									dateTime: toDate(interview.date)?.toISOString() || null,
									score: visible ? rawScore : null,
									job: interview.jobName || null,
									info: [],
									additional: [],
									...(visible ? {} : { masked: true }),
								},
								whatsappTriagemResult:
									interview.typeInterview?.toLowerCase() === 'whatsapp' ? {} : null,
							}
						})

						// ✅ Buscar dados completos do usuário
						const userData = candidate.userId
							? await infra.userRepository.getUser(candidate.userId)
							: null

						return {
							...candidate,
							jobsApplied,
							// ✅ Adicionar campos completos do usuário
							phone_number: userData?.phone_number || null,
							occupation: userData?.occupation || null,
							level: userData?.level || null,
							city: userData?.city || null,
							state: userData?.state || null,
							academic: userData?.academic || null,
							professional_experience: userData?.professional_experience || null,
							professionalObjectives: userData?.professionalObjectives || null,
							resumeUrl: userData?.resumeUrl || null,
							language: userData?.language || null,
							countryOfResidence: userData?.countryOfResidence || null,
							countriesOfInterest: userData?.countriesOfInterest || [],
							created_time: (() => {
								const ct = userData?.created_time
								if (!ct) return null
								if (typeof (ct as unknown as { toDate?: () => Date }).toDate === 'function') return (ct as unknown as { toDate: () => Date }).toDate()
								return new Date(ct as unknown as string | number | Date)
							})(),
							external_id: userData?.external_id || null,
							finished: userData?.finished || false,
							dreamJobsInterview: userData?.dreamJobsInterview || null,
							paymentDetails: userData?.paymentDetails || null,
							pdf_socioEmotional: userData?.pdf_socioEmotional || null,
							testing: userData?.testing || false,
						}
					} catch {
						return { ...candidate, jobsApplied: [] }
					}
				}),
			)
		},
	}
}
