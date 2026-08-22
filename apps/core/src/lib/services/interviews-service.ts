import { normalizeStageId } from '@coploy/domain'
import { createEmailTemplateResolver } from '@/lib/services/email-template-resolver'

import { COMPANY_PLANS } from '@/http/constants/company-free-constants'
import { env } from '@/env'
import { getInstallationFeatures } from '@/lib/installation-features'
import { toDate } from '@/lib/date-formatter'
import { createCandidateTimelineService } from '@/lib/services/candidate-timeline-service'
import { createCompanyCreditsService } from '@/lib/services/company-credits'
import { createCreditsService } from '@/services/credits-service'
import { BadRequestError } from '@coploy/shared/errors'
import type { InfraProvider } from '@coploy/infra'
import { createEmailSender, type EmailSender } from '@/lib/email-sender'
import { REJECTION_REASON_TAXONOMY_VERSION, findRejectionReason } from '@coploy/domain'
import type { CompanyInterview, Company, JobApplied, PublicInterview, UpdateInput, UsersCompany } from '@coploy/domain'
import type { CandidateLike } from '@coploy/domain'
import type { Interview } from '@/types/interviews'
import { deriveAuthenticityConfidence } from '@/lib/cheat-confidence'
import { isCourtesyInterview, pickInterviewDate } from '@/lib/saas-courtesy'
import { createOutboxWriter } from '@/lib/events/outbox-writer'
import {
	createRejectionFeedbackEmailSender,
	type RejectionFeedbackEmailClient,
} from '@/lib/services/rejection-feedback-email'
import {
	mergeFeedbackRiskFlags,
	validateInternalRejectionNoteOrThrow,
} from '@/lib/services/feedback-guardrails'

// ─── Credit masking helpers ─────────────────────────────────────────────────

// showScore: true only when hasCredit OR the interview is within the SaaS
// courtesy window (finished before `company.subscriptionTrial.startAt`).
// Keeps score: null when hidden — number | null contract with the front-end.

/**
 * Máscara de crédito: some o CONTEÚDO, nunca a identidade.
 *
 * O objeto devolvido não tinha `id`, e o schema da rota exige — então bastava
 * uma entrevista mascarada para a resposta inteira virar 400 e a tela de
 * Candidatos não abrir. Pior: sem `id` e sem as referências, o cliente não
 * conseguiria nem oferecer o desbloqueio daquela entrevista, que é justamente
 * o que a máscara existe para vender.
 *
 * Identidade e vínculo ficam; nota, análise e transcrição é que somem.
 */
function maskInterviewMinimal(interview: Record<string, unknown>, showScore: boolean) {
	const raw = interview?.score
	const scoreNum = typeof raw === 'string' ? Number.parseFloat(raw) || 0 : (raw as number) || 0
	return {
		id: interview?.id ?? null,
		job_applied_ref: interview?.job_applied_ref ?? null,
		job_ref: interview?.job_ref ?? null,
		user_ref: interview?.user_ref ?? null,
		masked: true,
		type_interview: interview?.type_interview ?? null,
		typeInterview: interview?.typeInterview ?? null,
		jobName: interview?.jobName ?? null,
		job_name: interview?.job_name ?? null,
		finished: interview?.finished ?? null,
		candidateStatus: interview?.candidateStatus ?? null,
		score: showScore ? scoreNum : null,
		date: interview?.date ?? null,
	}
}

function maskJobAppliedInterview(job: Record<string, unknown>, showScore: boolean) {
	const interview = job?.interview as Record<string, unknown> | null
	const exitJobResult = job?.exitJobResult as Record<string, unknown> | null
	const whatsappTriagemResult = job?.whatsappTriagemResult as Record<string, unknown> | null
	if (!interview && !exitJobResult && !whatsappTriagemResult) return job
	const raw = interview?.score
	const scoreNum = typeof raw === 'string' ? Number.parseFloat(raw) || 0 : (raw as number) || 0
	return {
		...job,
		interview: interview
			? { masked: true, type_interview: interview?.type_interview ?? null, job_name: interview?.job_name ?? null, score: showScore ? scoreNum : null, date: interview?.date || null, cheat: null }
			: null,
		exitJobResult: exitJobResult
			? { masked: true, message: 'Dados de exitJob disponíveis após pagamento de crédito', executive_summary: null, resignation_reasons: null, mapped_emotions: null, negative_aspects: null, positive_aspects: null, extra_insights: null, improvement_actions: null, reasons_over_time: null }
			: null,
		whatsappTriagemResult: whatsappTriagemResult
			? { masked: true, message: 'Dados de triagem WhatsApp disponíveis após pagamento de crédito', feedback_geral: null, porcentagem_match: null, recomendacao_recrutador: null, requisitos_atendidos: null, requisitos_nao_atendidos: null, pontos_atencao: null }
			: null,
		// Bloco final de avaliação de idioma é conteúdo sensível (feedback +
		// análise pro recrutador). Segue a mesma regra de exitJob/whatsapp:
		// bloqueado quando o conteúdo da entrevista está gated.
		languageEvaluation: null,
	}
}

/**
 * Normaliza os campos de avaliação de idioma por pergunta (InterviewInfoItem).
 * - `languageScore` aceita number|string (Drizzle numeric retorna string);
 *   converte para number | null.
 * - `languageFeedback`/`languageAnalise`: string | null (limpa "" vazio).
 * Mantém o restante do item intocado (spread).
 */
function normalizeLanguageInfoItem(item: Record<string, unknown>): Record<string, unknown> {
	const score = item.languageScore
	let languageScore: number | null = null
	if (typeof score === 'number') {
		languageScore = Number.isFinite(score) ? score : null
	} else if (typeof score === 'string' && score.trim() !== '') {
		const parsed = Number.parseFloat(score)
		languageScore = Number.isFinite(parsed) ? parsed : null
	}
	const normalizeString = (v: unknown): string | null => {
		if (v === null || v === undefined) return null
		if (typeof v === 'string') return v.trim() === '' ? null : v
		return String(v)
	}
	return {
		...item,
		languageScore,
		languageFeedback: normalizeString(item.languageFeedback),
		languageAnalise: normalizeString(item.languageAnalise),
	}
}

function isRejectedStatus(status: string): boolean {
	return status.toLowerCase() === 'rejected'
}

function resolveRejectionReasonOrThrow(params: {
	candidateStatus: string
	rejectionReasonCode?: string
	rejectionNote?: string
	existingReasonCode?: string | null
	existingReasonLabel?: string | null
	isTransitionToRejected: boolean
}) {
	if (!isRejectedStatus(params.candidateStatus)) return null

	const code = params.rejectionReasonCode ?? params.existingReasonCode ?? undefined
	if (!code && !params.isTransitionToRejected) return null
	if (!code) {
		throw new BadRequestError('rejectionReasonCode is required when rejecting a candidate')
	}

	const reason = findRejectionReason(code)
	if (!reason) {
		throw new BadRequestError(`Invalid rejectionReasonCode: ${code}`)
	}

	const note = params.rejectionNote?.trim()
	if (reason.requiresNote && !note) {
		throw new BadRequestError('rejectionNote is required for this rejection reason')
	}

	return {
		code: reason.code,
		label: reason.label || params.existingReasonLabel || reason.code,
		note,
		isNewReason: Boolean(params.rejectionReasonCode),
	}
}

function resolveRejectionFeedbackSentAtOrThrow(params: {
	candidateStatus: string
	rejectionFeedbackMessage?: string
	isTransitionToRejected: boolean
}) {
	if (!isRejectedStatus(params.candidateStatus)) return undefined
	if (!params.isTransitionToRejected) return undefined

	if (!params.rejectionFeedbackMessage?.trim()) {
		throw new BadRequestError('rejectionFeedbackMessage is required when rejecting a candidate')
	}

	return undefined
}

/**
 * Normaliza o bloco final `LanguageEvaluation` para o payload da API.
 * `score` vem como number|string (Firestore ou Postgres); converge para number.
 * `nivel`/`feedback`/`analise` são garantidos como string|null.
 * Retorna null quando o bloco está ausente ou vazio.
 */
function normalizeLanguageEvaluation(
	value: unknown,
): { score: number | null; nivel: string | null; feedback: string | null; analise: string | null } | null {
	if (!value || typeof value !== 'object') return null
	const v = value as Record<string, unknown>
	const score = v.score
	let scoreNum: number | null = null
	if (typeof score === 'number') scoreNum = Number.isFinite(score) ? score : null
	else if (typeof score === 'string' && score.trim() !== '') {
		const parsed = Number.parseFloat(score)
		scoreNum = Number.isFinite(parsed) ? parsed : null
	}
	const normalizeString = (s: unknown): string | null => {
		if (s === null || s === undefined) return null
		if (typeof s === 'string') return s.trim() === '' ? null : s
		return String(s)
	}
	const nivel = normalizeString(v.nivel)
	const feedback = normalizeString(v.feedback)
	const analise = normalizeString(v.analise)
	// Bloco vazio (todos null) → null pra não confundir o front.
	if (scoreNum === null && !nivel && !feedback && !analise) return null
	return { score: scoreNum, nivel, feedback, analise }
}

// Hunting (public) — não-comprado: devolve só identificadores básicos + interview
// mínimo + flag masked. NUNCA usar `...job` aqui: o spread vazaria
// `exitJobResult`/`whatsappTriagemResult`/`avaliacaoFinal`/cheat etc. (BLOCKER
// histórico). Allowlist explícita: se a empresa não comprou (ou não há viewer),
// o front renderiza overlay "Conteúdo bloqueado" — não pode haver feedback,
// pontos fortes, vídeo, análise por pergunta, etc.
function maskJobAppliedInterviewPublic(job: Record<string, unknown>, showScore: boolean) {
	const interview = job?.interview as Record<string, unknown> | null
	const raw = interview?.score
	const scoreNum = typeof raw === 'string' ? Number.parseFloat(raw) || 0 : (raw as number) || 0
	return {
		id: job?.id ?? null,
		appliedTime: job?.appliedTime ?? null,
		finishedTime: job?.finishedTime ?? null,
		finished: Boolean(job?.finished),
		isPracticing: Boolean(job?.isPracticing),
		companyOwner: job?.companyOwner ?? null,
		userApplied: job?.userApplied ?? null,
		jobApplied: job?.jobApplied ?? null,
		candidateStatus: job?.candidateStatus ?? null,
		avaliacaoFinal: null,
		exitJobResult: null,
		whatsappTriagemResult: null,
		interview: interview
			? {
					masked: true,
					type_interview: interview?.type_interview ?? null,
					job_name: interview?.job_name ?? null,
					score: showScore ? scoreNum : null,
					date: interview?.date || null,
				}
			: null,
	}
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

function resolveJobAppliedReference(interview: CompanyInterview, fallbackUserId: string) {
	const refPath = interview.job_applied_ref?.path || ''
	const pathParts = refPath.split('/')

	const userIdFromPath =
		pathParts.length >= 4 &&
		pathParts[0] === 'users' &&
		pathParts[2] === 'jobsApplied'
			? pathParts[1]
			: null

	const jobAppliedId =
		interview.job_applied_ref?.id ||
		(pathParts.length >= 4 ? pathParts[3] : null)

	return {
		candidateUserId:
			userIdFromPath ||
			interview.user_ref?.id ||
			fallbackUserId,
		jobAppliedId,
	}
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Uma linha por PESSOA, no conjunto inteiro (V2-205).
 *
 * A linha-resumo carrega a MELHOR nota da pessoa e o tempo de espera mais
 * crítico — é isso que o recrutador precisa ver para decidir se abre. As demais
 * entrevistas seguem no campo `otherInterviews`, para a tela expandir sem nova
 * chamada.
 *
 * Chave: `user_ref` quando existe; e-mail como fallback (o mesmo candidato pode
 * ter mais de um `user_ref` ao longo do tempo); id da entrevista em último caso,
 * que degrada para o comportamento antigo em vez de fundir gente diferente.
 */
/** Extrai o uid de `user_ref`, que vem como string, `{id}` ou `{path}`. */
function refToUserId(ref: unknown): string | null {
	if (!ref) return null
	if (typeof ref === 'string') return ref.split('/').pop() ?? null
	const obj = ref as { id?: string; path?: string }
	return obj.id ?? obj.path?.split('/').pop() ?? null
}

function groupInterviewsByCandidate<T extends Record<string, unknown>>(items: T[]): T[] {
	const groups = new Map<string, { head: T; others: T[] }>()

	const scoreOf = (item: T): number => {
		const raw = item.score
		const value =
			typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '').replace(',', '.'))
		return Number.isFinite(value) ? value : -1
	}

	for (const item of items) {
		const userRef = item.user_ref
		const key =
			(typeof userRef === 'string' ? userRef : (userRef as { id?: string } | null)?.id) ||
			(item.email as string) ||
			(item.id as string)

		const group = groups.get(key)
		if (!group) {
			groups.set(key, { head: item, others: [] })
			continue
		}
		// a melhor nota vira a linha-resumo; a anterior desce para a lista
		if (scoreOf(item) > scoreOf(group.head)) {
			group.others.push(group.head)
			group.head = item
		} else {
			group.others.push(item)
		}
	}

	return [...groups.values()].map(({ head, others }) => ({
		...head,
		interviewCount: others.length + 1,
		otherInterviews: others,
	})) as T[]
}


/*
 * Sem Motor não existe "entrevista finalizada" — a candidatura É o registro
 * (item 3 da revisão da open, 2026-08-22). Manter o filtro deixava Candidatos
 * e a busca global VAZIOS pra sempre na edição open: ninguém jamais atinge
 * finished=true sem o plugin. Com Motor, a régua original continua.
 */
function finishedFilter(): Array<{ field: string; operator: '=='; value: boolean }> {
	return getInstallationFeatures().motor
		? [{ field: 'finished', operator: '==', value: true }]
		: []
}

export function createInterviewsService(
	infra: InfraProvider,
	deps: { rejectionFeedbackEmailClient?: RejectionFeedbackEmailClient } = {},
) {
	const creditsService = createCreditsService(infra)
	const { getPaidUserIdsForCandidates } = createCompanyCreditsService(infra)
	const rejectionFeedbackEmailSender = createRejectionFeedbackEmailSender(
		deps.rejectionFeedbackEmailClient ?? createEmailSender(infra),
		createEmailTemplateResolver(infra),
	)


	/**
	 * Applies score masking to a flat list of enriched CompanyInterview records
	 * (used by listInterviews / job candidates / job metrics). Score is set to
	 * null unless the item is paid OR falls inside the SaaS courtesy window
	 * (interview finished before `company.subscriptionTrial.startAt`).
	 *
	 * After enrichWithBatchProcessing, job_applied_ref and user_ref are already
	 * plain strings (not DocumentReference objects).
	 *
	 * The `date` field on each item is consulted to decide courtesy — callers
	 * that don't have a date on each row are treated as "outside courtesy"
	 * (score hidden unless paid), which matches the new rule's safe default.
	 */
	async function applyListingScoreMask<T extends Record<string, unknown>>(
		companyId: string,
		items: T[],
	): Promise<T[]> {
		if (items.length === 0) return items

		let company: Company | null = null
		try {
			company = (await infra.companyRepository.getCompany(companyId)) as Company | null
		} catch {
			// Sem doc da empresa, cortesia é tratada como "não aplica" — todas
			// entrevistas seguem para a regra padrão (paid ou bloqueado).
		}

		const pairs = items
			.map((i) => ({ id: i.user_ref as string | null, jobApplied: i.job_applied_ref as string | null }))
			.filter((p): p is { id: string; jobApplied: string } => !!p.id && !!p.jobApplied)

		const paidKeys = new Set<string>()
		if (pairs.length > 0) {
			const result = await getPaidUserIdsForCandidates(companyId, pairs)
			for (const r of result) paidKeys.add(`${r.id}::${r.jobApplied}`)
		}

		return items.map((i) => {
			const key = `${i.user_ref}::${i.job_applied_ref}`
			const isPaid = paidKeys.has(key)
			const courtesy = isCourtesyInterview(company, i.date as Date | string | null | undefined)
			if (isPaid || courtesy) return i
			/*
			 * `locked` explícito (V2-207).
			 *
			 * Zerar a nota fazia "bloqueado por crédito" e "entrevista ainda sem
			 * nota" ficarem idênticos na tela — o recrutador via um traço e não
			 * sabia se esperava o processamento ou se precisava desbloquear.
			 */
			return { ...i, score: null, locked: true }
		})
	}

	/**
	 * Shared credit-masking logic used by both company and public candidate details.
	 *
	 * `companyId` aceita `null` no caminho público quando não há viewer logado
	 * (hunting anônimo). Nesse caso, paidKeys/grace/authenticity são pulados,
	 * tudo cai como "não comprado" — o masking em si NUNCA é pulado.
	 */
	async function applyCreditMasking(params: {
		companyId: string | null
		processedInterviews: Record<string, unknown>[]
		processedJobs: Record<string, unknown>[]
		isPublic: boolean
	}) {
		const { companyId, processedInterviews, processedJobs, isPublic } = params

		const pairs = processedJobs
			.map((j) => ({ id: j.userApplied as string, jobApplied: j.id as string }))
			.filter((p) => p.id && p.jobApplied)

		const paidKeys = new Set<string>()
		if (companyId && pairs.length > 0) {
			const result = await getPaidUserIdsForCandidates(companyId, pairs)
			for (const r of result) paidKeys.add(`${r.id}::${r.jobApplied}`)
		}

		// Carrega o doc da empresa do viewer uma única vez. Usado para:
		//   1. Período de graça enterprise → free (`subscriptionDetails.enterpriseEndedAt`).
		//   2. Janela de cortesia SaaS (`subscriptionTrial.startAt`) — entrevistas
		//      finalizadas ANTES desse timestamp são expostas em cortesia
		//      (nota + conteúdo), substituindo a antiga regra "1ª entrevista".
		let viewerCompany: Company | null = null
		if (companyId) {
			try {
				viewerCompany = (await infra.companyRepository.getCompany(companyId)) as Company | null
			} catch (err) {
				console.warn('[InterviewsService] Falha ao ler doc da empresa do viewer:', err)
			}

			const rawEnded = viewerCompany?.subscriptionDetails?.enterpriseEndedAt as
				| Date
				| string
				| null
				| undefined
			const enterpriseEndedAt = rawEnded
				? rawEnded instanceof Date
					? rawEnded
					: new Date(rawEnded)
				: null

			if (enterpriseEndedAt) {
				for (const job of processedJobs) {
					const key = `${job.userApplied}::${job.id}`
					if (paidKeys.has(key)) continue
					const candidateDateNormalized = pickInterviewDate(job)
					if (!candidateDateNormalized) continue
					if (candidateDateNormalized.getTime() < enterpriseEndedAt.getTime()) {
						paidKeys.add(key)
					}
				}
			}

			// Cortesia SaaS: data da entrevista < subscriptionTrial.startAt
			// libera a entrevista inteira (nota + conteúdo), seguindo o
			// mesmo regime do período de graça enterprise. Sem `startAt`
			// na empresa do viewer, nada é tratado como cortesia (todas
			// bloqueadas exceto se já pagas).
			if (viewerCompany?.subscriptionTrial?.startAt) {
				for (const job of processedJobs) {
					const key = `${job.userApplied}::${job.id}`
					if (paidKeys.has(key)) continue
					if (isCourtesyInterview(viewerCompany, pickInterviewDate(job))) {
						paidKeys.add(key)
					}
				}
			}
		}

		// Check authenticity analysis credits
		const authenticityPaidKeys = new Set<string>()
		if (companyId && pairs.length > 0) {
			const authenticityDocs = await infra.billingRepository.listCreditsUsed(companyId, {
				filters: [{ field: 'feature', operator: '==', value: 'authenticity_analysis' }],
				limitTo: 100,
			})
			for (const doc of authenticityDocs) {
				const userId = doc?.userId as string | undefined
				const jobApplied = doc?.jobApplied as string | undefined
				if (userId && jobApplied) authenticityPaidKeys.add(`${userId}::${jobApplied}`)
			}
		}

		// Decide mask regime per job: Hunting (allowlist + score teaser) when
		// chamado pelo path público, OR sem viewer (companyId null), OR quando
		// o job pertence a outra empresa que não a do viewer (caso defensivo no
		// caminho /companies/user/:id). Caso contrário aplica SaaS mask
		// (esconde nota e conteúdo sem crédito; cortesia já caiu em paidKeys).
		function isHuntingForJob(job: Record<string, unknown>): boolean {
			if (isPublic) return true
			if (!companyId) return true
			const jobOwner = (job.companyOwner as string | null | undefined) ?? null
			return !!jobOwner && jobOwner !== companyId
		}

		// Mask jobs — courtesy (data < subscriptionTrial.startAt) já está em
		// paidKeys, então não precisa de tratamento de teaser por idade aqui.
		const maskedJobs = processedJobs.map((job) => {
			const key = `${job.userApplied}::${job.id}`
			const isPaid = paidKeys.has(key)
			if (isPaid) {
				if (!authenticityPaidKeys.has(key) && (job.interview as Record<string, unknown>)?.cheat) {
					return { ...job, interview: { ...(job.interview as Record<string, unknown>), cheat: null } }
				}
				return job
			}
			if (isHuntingForJob(job)) {
				// Hunting: score teaser visível, conteúdo bloqueado.
				return maskJobAppliedInterviewPublic(job, true)
			}
			// SaaS sem crédito e fora da cortesia: nota e conteúdo ocultos.
			return maskJobAppliedInterview(job, false)
		})

		// Mask interviews — same per-job regime; o mirror identifica o owner.
		const maskedInterviews = processedInterviews.map((i) => {
			const mirror = processedJobs.find((j) =>
				isPublic ? j.id === i.job_applied_ref : j.jobApplied === i.job_applied_ref,
			)
			const interviewOwner =
				(mirror?.companyOwner as string | null | undefined) ??
				((i as { company_id?: string | null }).company_id ?? null)
			const treatAsHunting =
				isPublic || !companyId || (!!interviewOwner && interviewOwner !== companyId)
			if (!mirror) return maskInterviewMinimal(i, treatAsHunting)
			const key = `${mirror.userApplied}::${mirror.id}`
			const isPaid = paidKeys.has(key)
			if (isPaid) return i
			return maskInterviewMinimal(i, treatAsHunting)
		})

		// Mutate arrays in-place (matches original behavior)
		processedJobs.splice(0, processedJobs.length, ...maskedJobs)
		processedInterviews.splice(0, processedInterviews.length, ...maskedInterviews)
	}

	// ─── Shared interview-processing helpers ────────────────────────────────────

	/**
	 * Foto e ocupação atuais do candidato.
	 *
	 * `companyInterviews` guarda um retrato do momento da entrevista: quem troca
	 * o avatar depois continua com a foto velha na lista, e quem entrou sem foto
	 * fica sem para sempre — por isso o MESMO candidato aparecia com avatar numa
	 * linha e com iniciais na outra. O cache existe porque a lista é cheia de
	 * repetição: um candidato com 8 entrevistas seria 8 leituras do mesmo doc.
	 *
	 * ⚠️ O cache guarda a PROMESSA, não o resultado. O enriquecimento roda em
	 * `Promise.all`, então as 8 chamadas partem antes de qualquer uma resolver —
	 * com cache de resultado, `cache.has()` era falso nas 8 e as 8 liam mesmo
	 * assim. Guardando a promessa, a segunda em diante espera a primeira.
	 */
	async function resolveCurrentUser(
		userId: string | undefined,
		cache: Map<string, Promise<Record<string, unknown> | null>>,
	) {
		if (!userId) return null

		const cached = cache.get(userId)
		if (cached) return cached

		// try/catch em vez de `.catch`: o repositório pode nem devolver Promise
		// (mocks e adaptadores antigos), e uma foto não vale derrubar a listagem
		const pending = (async () => {
			try {
				return ((await infra.userRepository.getUser(userId)) ?? null) as Record<
					string,
					unknown
				> | null
			} catch {
				return null
			}
		})()

		cache.set(userId, pending)
		return pending
	}

	async function enrichWithBatchProcessing(
		interview: CompanyInterview,
		userCache: Map<string, Promise<Record<string, unknown> | null>> = new Map(),
	) {
		let batchProcessing = null
		const userRefId = interview.user_ref?.id ?? (interview.user_ref as unknown as string)
		try {
			const jobAppliedRefId = interview.job_applied_ref?.id ?? (interview.job_applied_ref as unknown as string)
			const jobApplied = await infra.candidateRepository.getJobApplied(userRefId, jobAppliedRefId)
			batchProcessing = jobApplied?.batchProcessing || null
		} catch {
			console.warn(`Failed to fetch batchProcessing for ${interview.id}`)
		}
		const currentUser = await resolveCurrentUser(userRefId, userCache)
		return {
			...interview,
			/*
			 * Identidade viva sobre o espelho.
			 *
			 * `photo_url` e `occupation` já vinham do doc do usuário; `name` ficou
			 * de fora e continuava sendo o retrato do momento da entrevista. Efeito
			 * visível: a MESMA pessoa aparecia como "Henrique HML" no Hunting e
			 * "Henrique Cabral" aqui, com o cargo certo nos dois — porque só o nome
			 * não era atualizado.
			 */
			name: (currentUser?.display_name as string) || interview.name || null,
			photo_url: (currentUser?.photo_url as string) || interview.photo_url || null,
			occupation: (currentUser?.occupation as string) || interview.occupation || null,
			date: toDate(interview.date),
			dateSelect: toDate(interview.dateSelect),
			job_ref: interview.job_ref?.id,
			job_applied_ref: interview.job_applied_ref?.id,
			user_ref: interview.user_ref?.id,
			batchProcessing,
		}
	}

	// ─── Service methods ────────────────────────────────────────────────────────

	return {
		/**
		 * Sobrepõe nome, cargo e foto com o doc VIVO do usuário.
		 *
		 * Exposto porque a mesma necessidade aparece em toda listagem que lê um
		 * espelho (`companyInterviews`, candidatos da vaga, kanban). Repetir a
		 * regra em cada rota foi o que produziu o estado em que cada tela mostrava
		 * uma época diferente da mesma pessoa.
		 *
		 * O espelho continua como fallback, e falha de leitura preserva o que já
		 * havia: nome velho é melhor que linha em branco.
		 */
		async enrichIdentities<T extends Record<string, unknown>>(items: T[]): Promise<T[]> {
			if (items.length === 0) return items
			const cache = new Map<string, Promise<Record<string, unknown> | null>>()

			return Promise.all(
				items.map(async (item) => {
					const ref = item.user_ref
					const userId =
						typeof ref === 'string'
							? ref.split('/').pop()
							: ((ref as { id?: string; path?: string } | null)?.id ??
								(ref as { path?: string } | null)?.path?.split('/').pop())
					if (!userId) return item

					const user = await resolveCurrentUser(userId, cache)
					if (!user) return item
					return {
						...item,
						name: (user.display_name as string) || item.name,
						occupation: (user.occupation as string) || item.occupation,
						photo_url: (user.photo_url as string) || item.photo_url,
					}
				}),
			)
		},

		/** List company interviews with pagination + optional search */
		/**
		 * Listagem da base de candidatos.
		 *
		 * Ganhou filtros de servidor (V2-204) porque os filtros locais só
		 * enxergavam a página atual: filtrar "nota ≥ 8" numa base de 110 devolvia
		 * o que existisse nos 25 primeiros, e o recrutador achava que era tudo.
		 *
		 * `groupBy: 'candidate'` (V2-205) agrupa por PESSOA no conjunto inteiro —
		 * agrupar no cliente só juntava o que estava na mesma página, então quem
		 * tinha entrevistas em duas páginas aparecia duas vezes.
		 */
		async listInterviews(params: {
			companyId: string
			page: number
			limit: number
			find?: string
			status?: string
			minScore?: number
			from?: string
			to?: string
			groupBy?: 'candidate'
		}) {
			const { companyId, page, limit, find, status, minScore, from, to, groupBy } = params
			// qualquer filtro além da busca exige varrer a base, não só a página
			const hasServerFilters = Boolean(status || minScore || from || to || groupBy)

			// Resolve enterprise status once — avoids duplicate fetches below
			const companyDoc = await infra.companyRepository.getCompany(companyId) as Company | null
			const isEnterpriseCompany =
				companyDoc?.subscriptionPlan === COMPANY_PLANS.enterprise ||
				(companyDoc?.subscriptionDetails as { plan?: string } | null | undefined)?.plan === COMPANY_PLANS.enterprise

			// Cheap path: Firestore native pagination (limit + 1 read) + N enrich calls.
			// Available whenever there's no full-text search and the caller is on the
			// first page — covers the common dashboard listing. Page > 1 still falls
			// to the slow in-memory path because we don't have cursor pagination yet.
			const shouldUseOptimizedQuery = !find && !hasServerFilters && page === 1 && limit <= 100

			if (shouldUseOptimizedQuery) {
				const interviewsWithExtra = await infra.candidateRepository.listCompanyInterviews(companyId, {
					filters: finishedFilter(),
					orderByField: 'date', orderDirection: 'desc', limitTo: limit + 1,
				}) as CompanyInterview[]

				const hasMore = interviewsWithExtra.length > limit
				const actual = hasMore ? interviewsWithExtra.slice(0, limit) : interviewsWithExtra
				const userCache = new Map<string, Promise<Record<string, unknown> | null>>()
				let processedInterviews = await Promise.all(
					actual.map((item) => enrichWithBatchProcessing(item, userCache)),
				)
				if (!isEnterpriseCompany) {
					processedInterviews = await applyListingScoreMask(companyId, processedInterviews)
				}
				const total = hasMore ? -1 : processedInterviews.length
				return { interviews: processedInterviews, pagination: { total, page, totalPages: hasMore ? -1 : 1, hasMore } }
			}

			const interviews = await infra.candidateRepository.listCompanyInterviews(companyId, {
				filters: finishedFilter(),
				orderByField: 'date', orderDirection: 'desc',
			}) as CompanyInterview[]

			const slowPathUserCache = new Map<string, Promise<Record<string, unknown> | null>>()
			let processedInterviews = await Promise.all(
				interviews.map((item) => enrichWithBatchProcessing(item, slowPathUserCache)),
			)

			if (find) {
				const searchLower = find.toLowerCase()
				processedInterviews = processedInterviews.filter(
					(i) =>
						i.name?.toLowerCase().includes(searchLower) ||
						i.email?.toLowerCase().includes(searchLower) ||
						i.jobName?.toLowerCase().includes(searchLower),
				)
			}

			if (status) {
				const wanted = normalizeStageId(status)
				processedInterviews = processedInterviews.filter(
					(i) =>
						normalizeStageId(
							(i.candidateStatus ??
								(i as unknown as Record<string, unknown>).candidate_status) as string,
						) === wanted,
				)
			}

			if (from || to) {
				const fromTime = from ? new Date(from).getTime() : null
				const toTime = to ? new Date(to).getTime() : null
				processedInterviews = processedInterviews.filter((i) => {
					const raw = i.date as Date | string | null | undefined
					if (!raw) return false
					const time = raw instanceof Date ? raw.getTime() : new Date(raw).getTime()
					if (Number.isNaN(time)) return false
					if (fromTime !== null && time < fromTime) return false
					if (toTime !== null && time > toTime) return false
					return true
				})
			}

			if (!isEnterpriseCompany) {
				processedInterviews = await applyListingScoreMask(companyId, processedInterviews)
			}

			/*
			 * Nota DEPOIS da máscara, de propósito.
			 *
			 * Em plano SaaS a nota de quem não foi desbloqueado é mascarada; filtrar
			 * antes vazaria a nota real pelo filtro — bastaria testar limiares para
			 * descobrir a nota sem gastar crédito.
			 */
			if (minScore !== undefined) {
				processedInterviews = processedInterviews.filter((i) => {
					const raw = i.score
					const value =
						typeof raw === 'number'
							? raw
							: Number.parseFloat(String(raw ?? '').replace(',', '.'))
					return Number.isFinite(value) && value >= minScore
				})
			}

			if (groupBy === 'candidate') {
				processedInterviews = groupInterviewsByCandidate(processedInterviews)
			}

			const total = processedInterviews.length
			const totalPages = Math.ceil(total / limit)
			const startIndex = (page - 1) * limit
			const paginatedInterviews = processedInterviews.slice(startIndex, startIndex + limit)
			return { interviews: paginatedInterviews, pagination: { total, page, totalPages, hasMore: page < totalPages } }
		},

		/** Get detailed candidate info (company interviews context) */
		async getCandidateDetails(params: {
			userId: string
			companyId: string
			company: { id: string; subscriptionPlan?: string | null; subscriptionDetails?: { plan?: string } | null }
		}) {
			const { userId, companyId, company } = params

			const userData = await infra.userRepository.getUser(userId) as UsersCompany | null
			if (!userData) return null

			// Fetch interviews for the exact user first. Some candidates can have
			// multiple `user_ref` values over time, while the ranking page groups
			// them by candidate identity (email + name). We expand by email below.
			const primaryInterviews = await infra.candidateRepository.listCompanyInterviews(companyId, {
				filters: [
					{ field: 'user_ref.id', operator: '==', value: userId },
					...finishedFilter(),
				],
			}) as CompanyInterview[]

			let interviews = primaryInterviews

			if (userData.email) {
				const interviewsByEmail = await infra.candidateRepository.listCompanyInterviews(companyId, {
					filters: [{ field: 'email', operator: '==', value: userData.email }],
				}) as CompanyInterview[]

				const knownNames = new Set(
					[
						userData.display_name,
						...primaryInterviews.map((interview) => interview.name || ''),
					]
						.map(normalizeCandidateIdentity)
						.filter(Boolean),
				)
				const shouldFilterByName = primaryInterviews.length > 0 && knownNames.size > 0

				const expandedInterviews = interviewsByEmail.filter((interview) => {
					if (!interview.finished) return false

					return (
						!shouldFilterByName ||
						knownNames.has(normalizeCandidateIdentity(interview.name))
					)
				})

				interviews = dedupeCompanyInterviews([
					...primaryInterviews,
					...expandedInterviews,
				])
			}

			const sortedInterviews = [...interviews].sort((a, b) => {
				const dateA = toDate(a.date)?.getTime() || 0
				const dateB = toDate(b.date)?.getTime() || 0
				return dateB - dateA
			})

			// Fetch typeInterview for each job
			const jobTypesMap = new Map<string, string>()
			const uniqueJobIds = [...new Set(sortedInterviews.map((i) => i.job_ref?.id).filter(Boolean))]
			await Promise.all(uniqueJobIds.map(async (jobId) => {
				if (jobId) {
					const job = await infra.jobRepository.getJob(companyId, jobId)
					if (job?.typeInterview) jobTypesMap.set(jobId, job.typeInterview)
				}
			}))

			const processedInterviews = sortedInterviews.map((interview) => ({
				...interview,
				date: toDate(interview.date),
				dateSelect: toDate(interview.dateSelect),
				job_ref: interview.job_ref?.id || null,
				job_applied_ref: interview.job_applied_ref?.id || null,
				user_ref: interview.user_ref?.id || null,
				typeInterview:
					interview.job_ref?.id
						? jobTypesMap.get(interview.job_ref.id) || interview.typeInterview || null
						: interview.typeInterview || null,
			}))

			// Average score
			let averageScore = null
			if (interviews.length > 0) {
				const sum = interviews.reduce((acc, i) => acc + Number(i.score ?? 0), 0)
				averageScore = Number((sum / interviews.length).toFixed(2))
			}

			const lastInterview = sortedInterviews.length > 0 ? sortedInterviews[0] : null
			const status = lastInterview?.candidateStatus || null
			const lastInterviewDate = toDate(lastInterview?.date) || null

			// Fetch the exact job applications linked from finished company interviews.
			// This avoids missing items because of arbitrary list limits or delayed
			// synchronization of the `finished` flag on the source jobApplied document.
			const jobAppliedKeys = [...new Set(
				sortedInterviews
					.map((interview) => {
						const { candidateUserId, jobAppliedId } = resolveJobAppliedReference(
							interview,
							userId,
						)

						if (!jobAppliedId) return null

						return `${candidateUserId}::${jobAppliedId}`
					})
					.filter((value): value is string => Boolean(value)),
			)]

			const jobAppliedEntries = await Promise.all(jobAppliedKeys.map(async (key) => {
				const [candidateUserId, jobAppliedId] = key.split('::')
				const jobApplied = await infra.candidateRepository.getJobApplied(
					candidateUserId,
					jobAppliedId,
				) as JobApplied | null

				return jobApplied ? ([key, jobApplied] as const) : null
			}))

			const jobsAppliedMap = new Map(
				jobAppliedEntries.filter(
					(entry): entry is readonly [string, JobApplied] => entry !== null,
				),
			)

			const jobsApplied = sortedInterviews.flatMap((interview) => {
				const { candidateUserId, jobAppliedId } = resolveJobAppliedReference(
					interview,
					userId,
				)

				if (!jobAppliedId) return []

				return [{
					interview,
					jobApplied: jobsAppliedMap.get(`${candidateUserId}::${jobAppliedId}`) || null,
					candidateUserId,
				}]
			})

			// Strengths via interview_tags
			const userWithTags = await infra.userRepository.getUser(userId) as UsersCompany | null
			const interviewTags = (userWithTags as any)?.interview_tags || []
			const strengthsSet = new Set<string>()
			if (Array.isArray(interviewTags)) {
				for (const tagDoc of interviewTags) {
					if (tagDoc.hard_skills && Array.isArray(tagDoc.hard_skills)) {
						for (const hs of tagDoc.hard_skills) {
							if (hs.tag && typeof hs.tag === 'string' && hs.tag.trim()) strengthsSet.add(hs.tag.trim())
						}
					}
				}
			}
			const strengths = Array.from(strengthsSet).sort()

		// TypeInterview for each jobApplied
		type JobMetadata = {
			typeInterview?: string | null
			identifier?: string | null
			carrerLevel?: string | null
			jobCategories?: string | null
			language?: string | null
			evaluateLanguage?: boolean | null
		}
		const jobMetadataMap = new Map<string, JobMetadata>()
			const uniqueJobIdsFromApplied = [...new Set(
				jobsApplied
					.map(({ interview, jobApplied }) => jobApplied?.jobApplied?.id || interview.job_ref?.id)
					.filter(Boolean),
			)]
		await Promise.all(uniqueJobIdsFromApplied.map(async (jobId) => {
			if (jobId) {
				const job = (await infra.jobRepository.getJob(companyId, jobId)) as
					| (JobMetadata & Record<string, unknown>)
					| null
				if (job) {
					jobMetadataMap.set(jobId, {
						typeInterview: job.typeInterview ?? null,
						identifier: job.identifier ?? null,
						carrerLevel: job.carrerLevel ?? null,
						jobCategories: job.jobCategories ?? null,
						language: (job as { language?: string | null }).language ?? null,
						// Flag de avaliação de idioma da vaga (default false quando ausente).
						// Cast defensivo: PostJob.evaluateLanguage está tipado em @coploy/domain,
						// mas o repositório pode retornar unknown quando vindo de JSONB.
						evaluateLanguage: (job as { evaluateLanguage?: boolean | null }).evaluateLanguage ?? false,
					})
				}
			}
		}))

			// Process jobsApplied
			const processedJobs = jobsApplied.map(({ interview, jobApplied, candidateUserId }) => {
				const { jobAppliedId } = resolveJobAppliedReference(interview, userId)
				const resolvedJobId = jobApplied?.jobApplied?.id || interview.job_ref?.id || null
				const fallbackInterviewDate = toDate(interview.date)?.toISOString() || null
				const jobMeta = resolvedJobId ? jobMetadataMap.get(resolvedJobId) : undefined
				const fallbackJobName =
					jobApplied?.jobName ||
					interview.jobName ||
					(interview as { job_name?: string | null }).job_name ||
					null
				const fallbackJobLevel =
					jobApplied?.jobLevel ||
					interview.carrerLevel ||
					(interview as { career_level?: string | null }).career_level ||
					null

				return {
					id: jobApplied?.id || jobAppliedId || interview.id,
					appliedTime: toDate(jobApplied?.appliedTime)?.toISOString() || fallbackInterviewDate,
					companyOwner: jobApplied?.companyOwner?.id || companyId,
					isPracticing: jobApplied?.isPracticing || false,
					userApplied: jobApplied?.userApplied?.id || candidateUserId,
					jobApplied: resolvedJobId,
					typeInterview:
						jobMeta?.typeInterview || interview.typeInterview || null,
					identifier: jobMeta?.identifier || null,
					carrerLevel:
						jobMeta?.carrerLevel ||
						interview.carrerLevel ||
						(interview as { career_level?: string | null }).career_level ||
						null,
					jobCategories: jobMeta?.jobCategories || null,
					language: jobMeta?.language || null,
					// Flag da vaga que liga a avaliação de idioma (default false =
					// entrevista sem avaliação de idioma). Consumido pelo front pra
					// decidir se mostra o bloco de idioma.
					evaluateLanguage: jobMeta?.evaluateLanguage ?? false,
					avaliacaoFinal: jobApplied?.avaliacaoFinal || null,
					exitJobResult: jobApplied?.exitJobResult || null,
					// Bloco final da avaliação de idioma (só populado quando
					// evaluateLanguage=true e a análise final rodou). Normalizado
					// para shape consistente; null quando ausente.
					languageEvaluation: normalizeLanguageEvaluation(jobApplied?.languageEvaluation),
					candidateStatus: jobApplied?.candidateStatus || interview.candidateStatus || null,
					finishedTime: toDate(jobApplied?.finishedTime)?.toISOString() || fallbackInterviewDate,
					// The interview itself is already confirmed as finished in companyInterviews.
					finished: true,
					batchProcessing: jobApplied?.batchProcessing
						? {
								status: jobApplied.batchProcessing.status || null,
								engineBatchId: jobApplied.batchProcessing.engineBatchId || null,
								queuedAt: toDate(jobApplied.batchProcessing.queuedAt)?.toISOString() || null,
								completedAt: toDate(jobApplied.batchProcessing.completedAt)?.toISOString() || null,
								error: jobApplied.batchProcessing.error || null,
							}
						: null,
					interview: jobApplied?.interview
						? {
								id: jobApplied.interview.id,
								dateTime: toDate(jobApplied.interview.dateTime)?.toISOString() || null,
								generalFeedback: jobApplied.interview.generalFeedback || null,
								// Campos de avaliação de idioma por pergunta são SEPARADOS
								// dos técnicos (score/feedback). Normaliza number|string → number
								// para `languageScore` e null-safe pros textos.
								info: jobApplied.interview.info?.map((item) =>
									normalizeLanguageInfoItem(item as unknown as Record<string, unknown>),
								) || [],
								additional:
									jobApplied.interview.additional ||
									(jobApplied.interview as { addicional?: unknown[] }).addicional ||
									[],
								job: jobApplied.interview.job || fallbackJobName,
								leveljob: jobApplied.interview.leveljob || fallbackJobLevel,
								recomentation: jobApplied.interview.recomentation || null,
								score: jobApplied.interview.score || null,
								state: jobApplied.interview.state || false,
								scom: jobApplied.interview.scom || 0,
								sres: jobApplied.interview.sres || 0,
								stec: jobApplied.interview.stec || 0,
								generalStrengths: jobApplied.interview.generalStrengths || null,
								generalImprovement: jobApplied.interview.generalImprovement || null,
								aderencia_descricao: jobApplied.interview.aderencia_descricao || 0,
								alinhamento_responsabilidades: jobApplied.interview.alinhamento_responsabilidades || 0,
								requisitos_atendidos: jobApplied.interview.requisitos_atendidos || 0,
								alinhamento_nivel: jobApplied.interview.alinhamento_nivel || 0,
								gap_para_proximo_nivel: jobApplied.interview.gap_para_proximo_nivel || 0,
								estruturacao: jobApplied.interview.estruturacao || 0,
								exemplificacao: jobApplied.interview.exemplificacao || 0,
								profundidade: jobApplied.interview.profundidade || 0,
								nivel_confianca: jobApplied.interview.nivel_confianca || 0,
								cheat: deriveAuthenticityConfidence(
									jobApplied.interview.cheat as Record<string, unknown> | null | undefined,
									jobApplied.interview.info as Array<Record<string, unknown>> | null | undefined,
								),
							}
						: {
								id: interview.id || jobAppliedId || `${candidateUserId}-${resolvedJobId || 'unknown-job'}`,
								dateTime: fallbackInterviewDate,
								generalFeedback: null,
								info: [],
								additional: [],
								job: fallbackJobName,
								leveljob: fallbackJobLevel,
								recomentation: null,
								score: interview.score || null,
								state: false,
								scom: 0,
								sres: 0,
								stec: 0,
								generalStrengths: null,
								generalImprovement: null,
								aderencia_descricao: 0,
								alinhamento_responsabilidades: 0,
								requisitos_atendidos: 0,
								alinhamento_nivel: 0,
								gap_para_proximo_nivel: 0,
								estruturacao: 0,
								exemplificacao: 0,
								profundidade: 0,
								nivel_confianca: 0,
								cheat: null,
							},
					whatsappTriagemResult: jobApplied?.whatsappTriagemResult
						? {
								feedback_geral: jobApplied.whatsappTriagemResult.feedback_geral || null,
								porcentagem_match: jobApplied.whatsappTriagemResult.porcentagem_match || null,
								recomendacao_recrutador: jobApplied.whatsappTriagemResult.recomendacao_recrutador || null,
								requisitos_atendidos: jobApplied.whatsappTriagemResult.requisitos_atendidos || null,
								requisitos_nao_atendidos: jobApplied.whatsappTriagemResult.requisitos_nao_atendidos || null,
								pontos_atencao: jobApplied.whatsappTriagemResult.pontos_atencao || null,
							}
						: interview.typeInterview?.toLowerCase() === 'whatsapp'
							? {
									feedback_geral: null,
									porcentagem_match: interview.score || null,
									recomendacao_recrutador: null,
									requisitos_atendidos: null,
									requisitos_nao_atendidos: null,
									pontos_atencao: null,
								}
							: null,
				}
			})

			// Credit masking
			const isEnterprise = company?.subscriptionPlan === COMPANY_PLANS.enterprise || company?.subscriptionDetails?.plan === COMPANY_PLANS.enterprise
			if (!isEnterprise) {
				await applyCreditMasking({ companyId, processedInterviews: processedInterviews as unknown as Record<string, unknown>[], processedJobs: processedJobs as unknown as Record<string, unknown>[], isPublic: false })
			}

			return {
				candidate: {
					id: userId,
					name: userData.display_name || null,
					email: userData.email || null,
					phone_number: userData.phone_number || null,
					photo_url: userData.photo_url || null,
					interviews: processedInterviews,
					averageScore,
					lastInterview: lastInterviewDate?.toISOString() || null,
					status,
					jobsApplied: processedJobs,
					strengths,
				},
			}
		},

		/** Get public candidate details */
		async getPublicCandidateDetails(params: {
			userId: string
			company?: { id: string; subscriptionPlan?: string | null; subscriptionDetails?: { plan?: string } | null } | null
		}) {
			const { userId, company } = params

			/*
			 * `users/{id}` pode não existir e isso NÃO é 404.
			 *
			 * O pool de hunting é alimentado por `public_interviews`, que carrega os
			 * dados do candidato (nome, ocupação, cidade, foto). Exigir o doc em
			 * `users` fazia a lista mostrar gente que a tela de detalhe se recusava
			 * a abrir — reproduzido com um talento real cujas 3 entrevistas públicas
			 * apontam pra um `users/{id}` inexistente. A entrevista é a fonte; o doc
			 * de usuário, quando existe, tem precedência por ser mais atual.
			 */
			const userData = (await infra.userRepository
				.getUser(userId)
				.catch(() => null)) as UsersCompany | null

			const allInterviews = await infra.candidateRepository.listPublicInterviews({
				orderByField: 'date', orderDirection: 'desc', limitTo: 1000,
			}) as PublicInterview[]

			// Filter by user + type='interview'
			const interviews = allInterviews.filter((i) => {
				const userRefId = i.user_ref?.id
				const typeInterview = i.type_interview?.toLowerCase() ?? 'interview'
				return userRefId === userId && typeInterview === 'interview'
			})

			// sem doc de usuário E sem entrevista pública não há talento nenhum
			if (!userData && interviews.length === 0) return null

			const sortedInterviews = [...interviews].sort((a, b) => {
				const dateA = toDate(a.date)?.getTime() || 0
				const dateB = toDate(b.date)?.getTime() || 0
				return dateB - dateA
			})

			// Process interviews with score normalization
			const processedInterviews = sortedInterviews.map((interview) => {
				let scoreInterview: number | null = null
				if (typeof interview.score === 'string') {
					const parsed = Number.parseFloat(interview.score)
					scoreInterview = !Number.isNaN(parsed) ? parsed : null
				} else if (typeof interview.score === 'number') {
					scoreInterview = !Number.isNaN(interview.score) ? interview.score : null
				}
				const scoreGeral = (interview as any).interview_tags?.resumo_executivo?.score_geral ?? null
				let scoreValue = 0
				if (scoreInterview !== null && !Number.isNaN(scoreInterview)) scoreValue = scoreInterview
				else if (scoreGeral !== null && !Number.isNaN(scoreGeral)) scoreValue = scoreGeral
				if (scoreValue > 10) scoreValue = scoreValue / 10

				return {
					...interview,
					date: toDate(interview.date),
					job_applied_ref: interview.job_applied_ref?.id || null,
					job_ref: interview.job_ref?.id || null,
					user_ref: interview.user_ref?.id || null,
					academic: interview.academic || null,
					phone_number: interview.phone_number || null,
					professional_experience: interview.professionalExperience || null,
					occupation: interview.occupation || null,
					city: interview.city || null,
					state: interview.state || null,
					typeInterview: interview.typeInterview || null,
					score: scoreValue,
				}
			})

			let averageScore = null
			if (interviews.length > 0) {
				const sum = processedInterviews.reduce((acc, i) => acc + i.score, 0)
				averageScore = Number((sum / interviews.length).toFixed(2))
			}

			const lastInterview = sortedInterviews.length > 0 ? sortedInterviews[0] : null
			const status = 'Completed'
			const lastInterviewDate = toDate(lastInterview?.date)

			// Fetch jobsApplied via interview refs, preserving mirror association
			const jobAppliedPromises = interviews.map(async (interview) => {
				if (interview.job_applied_ref?.path) {
					const pathParts = interview.job_applied_ref.path.split('/')
					if (pathParts.length >= 4) {
						const candidate = pathParts[1]
						const jobAppliedId = pathParts[3]
						try {
							const jobApplied = await infra.candidateRepository.getJobApplied(candidate, jobAppliedId) as JobApplied | null
							return { jobApplied, mirror: interview }
						} catch (error) {
							throw new BadRequestError(error as string)
						}
					}
				}
				return { jobApplied: null, mirror: interview }
			})

			const jobsAppliedResults = await Promise.all(jobAppliedPromises)
			const jobsApplied = jobsAppliedResults.filter((item): item is { jobApplied: JobApplied; mirror: PublicInterview } => {
				if (!item.jobApplied) return false
				// typeInterview may exist on the Firestore document but not on the TS type
				const doc = item.jobApplied as unknown as Record<string, unknown>
				const rootType = typeof doc.typeInterview === 'string' ? doc.typeInterview : undefined
				const interviewType = item.jobApplied.interview
					? (item.jobApplied.interview as Record<string, unknown>).type_interview as string | undefined
					: undefined
				const resolvedType = (rootType ?? interviewType ?? 'interview').toLowerCase()
				return resolvedType === 'interview'
			})

			// Build interviewTags map
			const interviewTagsMap = new Map()
			for (const interview of sortedInterviews) {
				const jobAppliedId = interview.job_applied_ref?.path?.split('/').pop()
				if (jobAppliedId && interview.interview_tags) {
					interviewTagsMap.set(jobAppliedId, interview.interview_tags)
				}
			}

		// Process jobsApplied — fallback to mirror (public_interviews) refs
		// when the underlying JobApplied doc has missing references (legacy docs).
		const filteredJobsApplied = jobsApplied.map(({ jobApplied: job, mirror }) => {
			const interview = job.interview
			return {
				id: job.id,
				appliedTime: toDate(job.appliedTime),
				companyOwner: job.companyOwner?.id || mirror.company_id || null,
				userApplied: job.userApplied?.id || mirror.user_ref?.id || userId || null,
				jobApplied: job.jobApplied?.id || mirror.job_ref?.id || null,
				finishedTime: toDate(job.finishedTime),
				finished: job.finished || false,
				isPracticing: job.isPracticing || false,
				candidateStatus: job.candidateStatus || null,
				avaliacaoFinal: job.avaliacaoFinal || null,
				exitJobResult: job.exitJobResult || null,
				// Bloco final da avaliação de idioma (só populado quando a vaga
				// tinha evaluateLanguage=true e a análise final rodou). É conteúdo
				// sensível (feedback + análise pro recrutador); a masking SaaS/Hunting
				// abaixo substitui o job inteiro quando não-paid, garantindo null.
				languageEvaluation: normalizeLanguageEvaluation(job.languageEvaluation),
				interview: interview
					? {
							...interview,
							interview_tags: interviewTagsMap.get(job.id) || null,
							// Normaliza campos de idioma por pergunta (mesma regra do
							// path company): score string→number, feedbacks null-safe.
							info: Array.isArray(interview.info)
								? interview.info.map((item) =>
									normalizeLanguageInfoItem(item as unknown as Record<string, unknown>),
								)
								: interview.info,
							answers: interview.answers?.map((answer) => ({
								...answer,
								dateTime: toDate(answer.dateTime),
							})),
						}
					: null,
			}
		})

			// Credit masking — Hunting (CONTEÚDO só com COMPRA ou enterprise).
			// Regra de ouro: NUNCA pular masking pra viewer não-enterprise. Sem
			// viewer logado (company null), tratar como "não comprou nada" — todo
			// o conteúdo da entrevista mascarado, restando dados básicos do
			// candidato + score per matrix Opção A.
			const isEnterprise = company?.subscriptionPlan === COMPANY_PLANS.enterprise || company?.subscriptionDetails?.plan === COMPANY_PLANS.enterprise
			let responseAverageScore: number | null = averageScore
			if (!isEnterprise) {
				let viewerCompany: Company | null = null
				if (company?.id) {
					try {
						viewerCompany = (await infra.companyRepository.getCompany(company.id)) as Company | null
					} catch (err) {
						console.warn('[getPublicCandidateDetails] failed loading viewer company doc:', err)
					}
				}

				// Hunting Opção A: se o viewer tem ao menos uma entrevista com esse
				// candidato (descontando crédito desbloqueado e janela de cortesia
				// SaaS — data < subscriptionTrial.startAt), oculta a média. Não
				// recalcula com subset — esconde a nota inteira pra não vazar
				// média parcial. Sem viewer (company null), Opção A não se aplica.
				if (company?.id) {
					const huntingCredits = await infra.billingRepository
						.listCreditsUsed(company.id, {
							filters: [{ field: 'isHunting', operator: '==', value: true }],
							limitTo: 5000,
						})
						.catch((err) => {
							console.warn('[getPublicCandidateDetails] failed loading hunting credits, defaulting to no exception:', err)
							return [] as Awaited<ReturnType<typeof infra.billingRepository.listCreditsUsed>>
						})
					const huntingUnlockedJobAppliedIds = new Set<string>()
					for (const c of huntingCredits) {
						if (c.jobApplied) huntingUnlockedJobAppliedIds.add(c.jobApplied)
					}
					const viewerHasUnmaskedInterview = sortedInterviews.some((int) => {
						if (int.company_id !== company.id) return false
						const jaId = int.job_applied_ref?.id
							|| int.job_applied_ref?.path?.split('/').pop()
							|| null
						if (jaId && huntingUnlockedJobAppliedIds.has(jaId)) return false
						if (isCourtesyInterview(viewerCompany, int.date)) return false
						return true
					})
					if (viewerHasUnmaskedInterview) {
						responseAverageScore = null
					}
				}

				await applyCreditMasking({ companyId: company?.id ?? null, processedInterviews: processedInterviews as unknown as Record<string, unknown>[], processedJobs: filteredJobsApplied as unknown as Record<string, unknown>[], isPublic: true })
			}

			return {
				candidate: {
					id: userId,
					name: userData?.display_name || lastInterview?.name || null,
					email: userData?.email || lastInterview?.email || null,
					photo_url: userData?.photo_url || lastInterview?.photo_url || null,
					interviews: processedInterviews,
					averageScore: responseAverageScore,
					lastInterview: lastInterviewDate?.toISOString() || null,
					status,
					academic: lastInterview?.academic || null,
					phone_number: userData?.phone_number || lastInterview?.phone_number || null,
					professional_experience: lastInterview?.professionalExperience || null,
					occupation: userData?.occupation || lastInterview?.occupation || null,
					city: lastInterview?.city || null,
					state: lastInterview?.state || null,
					typeInterview: lastInterview?.typeInterview || null,
					career_level: lastInterview?.career_level || null,
					jobsApplied: filteredJobsApplied,
				},
			}
		},

		/** Fast-track interview processing (skip batch queue) */
		async fastTrackInterview(params: {
			candidateUserId: string
			jobAppliedId: string
			companyId: string
			authenticatedUserId: string
			accessToken: string
			requestId: string
			ip: string | null
			userAgent: string | null
		}) {
			const { candidateUserId, jobAppliedId, companyId, authenticatedUserId, accessToken, requestId, ip, userAgent } = params

			// 1. Fetch fresh credit balance
			const companyData = await infra.companyRepository.getCompany(companyId) as Company | null
			if (!companyData) throw new BadRequestError('Empresa não encontrada')

			const subscriptionCredits = companyData.subscriptionCredits || { creditsMonthly: 0, creditsCourtesy: 0, creditsFixed: 0 }
			const totalCredits = (subscriptionCredits.creditsFixed || 0) + (subscriptionCredits.creditsMonthly || 0) + (subscriptionCredits.creditsCourtesy || 0)
			if (totalCredits < 1) throw new BadRequestError('Saldo de créditos insuficiente')

			// 2. Validate jobApplied
			const jobApplied = await infra.candidateRepository.getJobApplied(candidateUserId, jobAppliedId) as JobApplied | null
			if (!jobApplied) throw new BadRequestError('Interview not found')

			const companyOwner = (typeof companyData.ownerCompany === 'string' ? companyData.ownerCompany : companyData.ownerCompany?.id) || companyData.id
			let postJobId: string | undefined
			if (jobApplied?.jobApplied?.path) {
				const pathParts = jobApplied.jobApplied.path.split('/')
				postJobId = pathParts[3] || undefined
			}

			// 3. Check if already processed
			if (jobApplied.batchProcessing?.status === 'completed' || jobApplied.batchProcessing?.status === 'fast_tracked') {
				throw new BadRequestError('Interview already processed')
			}

			// 4. Consume credit
			const creditResult = await creditsService.consumeCredit({
				companyId, feature: 'fast_track_interview', companyOwner,
				userId: candidateUserId, jobApplied: jobAppliedId, postJobId,
				usedBy: authenticatedUserId, ip, userAgent,
			})

			if (creditResult.alreadyUsed) {
				throw new BadRequestError('Fast-track já foi acionado para esta entrevista')
			}

			// 5. Call engine
			const engineUrl = `${env.ENGINE_URL}/interviews/${jobAppliedId}/fast-track`
			const response = await fetch(engineUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'X-Request-Id': requestId },
				body: JSON.stringify({ requestedBy: authenticatedUserId, candidateUserId }),
			})

			if (!response.ok) {
				let error: Record<string, unknown> | { message: string }
				try { error = await response.json() as Record<string, unknown> } catch { error = { message: await response.text() } }
				throw new BadRequestError((error as { message?: string }).message || 'Failed to trigger fast-track')
			}

			return { success: true, message: 'Fast-track processing initiated successfully', jobAppliedId, processingMode: 'fast_track' as const, creditUsed: true, creditId: creditResult.creditId }
		},

		/** Process authenticity analysis (cheat detection) */
		async processAuthenticityAnalysis(params: {
			userId: string
			jobAppliedId: string
			companyId: string
			company: { id: string; ownerCompany?: { id: string } | null; subscriptionPlan?: string | null }
			authenticatedUserId: string
			accessToken: string
			requestId: string
			ip: string | null
			userAgent: string | null
		}) {
			const { userId, jobAppliedId, companyId, company, authenticatedUserId, accessToken, requestId, ip, userAgent } = params

			const jobApplied = await infra.candidateRepository.getJobApplied(userId, jobAppliedId) as JobApplied | null
			if (!jobApplied) throw new BadRequestError('Entrevista não encontrada')

			// typeInterview may exist on the Firestore document but not on the TS type
			const typeInterview = (jobApplied as unknown as Record<string, unknown>).typeInterview as string | undefined ?? 'interview'
			if (typeInterview !== 'interview') {
				throw new BadRequestError(`Análise de autenticidade não disponível para entrevistas do tipo "${typeInterview}". Apenas entrevistas normais (interview) suportam esta funcionalidade.`)
			}

			const companyOwner = company.ownerCompany?.id || company.id
			let postJobId = ''
			if (jobApplied?.jobApplied?.path) {
				postJobId = jobApplied.jobApplied.path.split('/')[3] || ''
			} else if (jobApplied?.jobApplied?.id) {
				postJobId = String(jobApplied.jobApplied.id)
			}
			if (!postJobId) throw new BadRequestError('Não foi possível identificar a vaga associada')

			const isEnterprise = company.subscriptionPlan?.toLowerCase() === 'enterprise'
			const analysisAlreadyExists = !!jobApplied?.interview?.cheat

			// ENTERPRISE: unlimited access
			if (isEnterprise && analysisAlreadyExists) {
				return { success: true, message: 'Análise de autenticidade disponível' }
			}

			// NON-ENTERPRISE: check if already purchased
			if (!isEnterprise) {
				const existingCredit = await infra.billingRepository.listCreditsUsed(companyId, {
					filters: [
						{ field: 'feature', operator: '==', value: 'authenticity_analysis' },
						{ field: 'userId', operator: '==', value: userId },
						{ field: 'jobApplied', operator: '==', value: jobAppliedId },
					],
					limitTo: 1,
				})

				if (existingCredit?.length > 0) {
					return { success: true, message: 'Análise de autenticidade disponível' }
				}

				// Analysis exists (processed by another company) → consume credit without reprocessing
				if (analysisAlreadyExists) {
					await creditsService.consumeCredit({ companyId, feature: 'authenticity_analysis', companyOwner, userId, jobApplied: jobAppliedId, postJobId, usedBy: authenticatedUserId, ip, userAgent })
					const updatedCompany = await infra.companyRepository.getCompany(companyId) as Company | null
					const sc = updatedCompany?.subscriptionCredits || { creditsMonthly: 0, creditsCourtesy: 0, creditsFixed: 0 }
					return {
						success: true,
						message: 'Análise de autenticidade desbloqueada com sucesso',
						creditsRemaining: { creditsMonthly: sc.creditsMonthly || 0, creditsCourtesy: sc.creditsCourtesy || 0, creditsFixed: sc.creditsFixed || 0, creditsTotal: (sc.creditsMonthly || 0) + (sc.creditsCourtesy || 0) + (sc.creditsFixed || 0) },
					}
				}
			}

			// Process analysis via integration service
			const integrationUrl = `${env.INTEGRATION_URL}/api/v2/fast-interview/cheat-detection/${userId}/${jobAppliedId}`
			try {
				const integrationResponse = await fetch(integrationUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'X-Request-Id': requestId },
					body: JSON.stringify({}),
				})

				if (!integrationResponse.ok) {
					let errorMessage = `Erro ao processar análise (status ${integrationResponse.status})`
					try {
						const errorData = await integrationResponse.json() as any
						errorMessage = errorData.message || errorMessage
					} catch {
						try { const textResponse = await integrationResponse.text(); if (textResponse) errorMessage = textResponse } catch { /* ignore */ }
					}
					throw new Error(errorMessage)
				}

				await integrationResponse.json() // consume body

				// Record credit usage
				if (isEnterprise) {
					await infra.billingRepository.createCreditsUsed(companyId, {
						feature: 'authenticity_analysis', companyOwner, userId, jobApplied: jobAppliedId, postJobId,
						usedAt: new Date(), usedBy: authenticatedUserId, ip, userAgent, source: 'api', debitedFrom: null,
					})
				} else {
					await creditsService.consumeCredit({ companyId, feature: 'authenticity_analysis', companyOwner, userId, jobApplied: jobAppliedId, postJobId, usedBy: authenticatedUserId, ip, userAgent })
				}

				// Fetch updated credit balance
				let creditsRemaining
				if (!isEnterprise) {
					const updatedCompany = await infra.companyRepository.getCompany(companyId) as Company | null
					const sc = updatedCompany?.subscriptionCredits || { creditsMonthly: 0, creditsCourtesy: 0, creditsFixed: 0 }
					creditsRemaining = { creditsMonthly: sc.creditsMonthly || 0, creditsCourtesy: sc.creditsCourtesy || 0, creditsFixed: sc.creditsFixed || 0, creditsTotal: (sc.creditsMonthly || 0) + (sc.creditsCourtesy || 0) + (sc.creditsFixed || 0) }
				}

				return { success: true, message: 'Análise de autenticidade processada com sucesso', creditsRemaining }
			} catch (error) {
				console.error('[Authenticity Analysis] Erro ao processar:', error)
				throw new BadRequestError(error instanceof Error ? error.message : 'Falha ao processar análise de autenticidade')
			}
		},

		/** Update interview candidate status */
		async updateInterviewStatus(params: {
			interviewId: string
			candidateStatus: string
			postJobId: string
			companyId: string
			rejectionEmailSentAt?: string
			rejectionFeedbackMessage?: string
			rejectionReasonCode?: string
			rejectionNote?: string
			rejectedByUserId?: string
			/**
			 * Quem moveu, para o histórico.
			 *
			 * Gravado junto com o evento em vez de resolvido na leitura: o
			 * histórico é registro do que aconteceu, e o nome de quem agiu naquele
			 * dia não deve mudar porque a pessoa trocou de nome (ou saiu da
			 * empresa) depois.
			 */
			actorName?: string | null
		}) {
			const {
				interviewId,
				candidateStatus,
				postJobId,
				companyId,
				rejectionFeedbackMessage,
				rejectionReasonCode,
				rejectionNote,
				rejectedByUserId,
				actorName,
			} = params

			const interview = await infra.candidateRepository.getJobInterview(companyId, postJobId, interviewId) as CompanyInterview | null
			if (!interview) {
				throw new BadRequestError(`Interview not found at path: companies/${companyId}/postJob/${postJobId}/interviews/${interviewId}. Please check if the post_job_id and interview_id are correct.`)
			}

			const isTransitionToRejected =
				isRejectedStatus(candidateStatus) && !isRejectedStatus(interview.candidateStatus || '')
			const rejectionReason = resolveRejectionReasonOrThrow({
				candidateStatus,
				rejectionReasonCode,
				rejectionNote,
				existingReasonCode: interview.rejectionReasonCode,
				existingReasonLabel: interview.rejectionReasonLabel,
				isTransitionToRejected,
			})
			const rejectionNoteGuardrails = rejectionReason?.note
				? validateInternalRejectionNoteOrThrow(rejectionReason.note)
				: null

			const now = new Date().toISOString()
			const dateSelectTimestamp = new Date()
			const rejectionFeedbackSentAt = resolveRejectionFeedbackSentAtOrThrow({
				candidateStatus,
				rejectionFeedbackMessage,
				isTransitionToRejected,
			})
			const jobAppliedRefPath = interview.job_applied_ref?.path || ''
			const reviewJobAppliedId = interview.job_applied_ref?.id || jobAppliedRefPath.split('/').pop() || interviewId
			const sentFeedback = rejectionFeedbackMessage && isTransitionToRejected
				? await rejectionFeedbackEmailSender.send({
						candidate: {
							email: interview.email,
							name: interview.name,
						},
						message: rejectionFeedbackMessage,
						jobName: interview.jobName || (interview as { job_name?: string | null }).job_name || null,
						companyName: ((await infra.companyRepository.getCompany(companyId)) as Company | null)?.companyName ?? null,
						companyId,
						jobId: postJobId,
						jobAppliedId: reviewJobAppliedId,
						language: (interview as { language?: string | null }).language ?? null,
						rejectionDecisionSource: 'manual',
					})
				: null
			const persistedRejectionFeedbackSentAt = sentFeedback?.sentAt ?? rejectionFeedbackSentAt
			const updateData: Record<string, unknown> = {
				candidate_status: candidateStatus,
				candidateStatus,
				date_select: dateSelectTimestamp,
				dateSelect: dateSelectTimestamp,
				updated_at: now,
			}

			if (rejectionReason) {
				updateData.rejectionReasonCode = rejectionReason.code
				updateData.rejectionReasonLabel = rejectionReason.label
				updateData.rejectionDecisionSource = 'manual'
				updateData.rejectionDecidedByUserId = rejectedByUserId ?? null
				updateData.rejectionTaxonomyVersion = REJECTION_REASON_TAXONOMY_VERSION
				updateData.rejectionEvidence = null
				if (rejectionReason.note) updateData.rejectionNote = rejectionReason.note
			}

			const rejectionRiskFlags = mergeFeedbackRiskFlags(
				interview.rejectionRiskFlags ?? null,
				sentFeedback?.riskFlags,
				rejectionNoteGuardrails?.riskFlags,
			)

			if (persistedRejectionFeedbackSentAt) {
				updateData.rejectionFeedbackSentAt = persistedRejectionFeedbackSentAt
			}
			if (rejectionReason || persistedRejectionFeedbackSentAt) {
				updateData.rejectionRiskFlags = rejectionRiskFlags.length ? rejectionRiskFlags : null
			}

			await infra.candidateRepository.updateJobInterview(companyId, postJobId, interviewId, updateData)
			await infra.candidateRepository.updateCompanyInterview(companyId, interviewId, updateData)

			// Update in users/{uid}/jobsApplied/{jobAppliedId}
			const userRefPath = interview.user_ref?.path || ''
			const userUid = userRefPath.split('/').pop()
			const jobAppliedId = jobAppliedRefPath.split('/').pop()

			if (userUid && jobAppliedId) {
				await infra.candidateRepository.updateJobApplied(userUid, jobAppliedId, {
					candidateStatus,
					dateSelect: dateSelectTimestamp,
					updated_at: now,
					...(rejectionReason && {
						rejectionReasonCode: rejectionReason.code,
						rejectionReasonLabel: rejectionReason.label,
						rejectionDecisionSource: 'manual',
						rejectionDecidedByUserId: rejectedByUserId ?? null,
						rejectionTaxonomyVersion: REJECTION_REASON_TAXONOMY_VERSION,
						rejectionEvidence: null,
						...(rejectionReason.note ? { rejectionNote: rejectionReason.note } : {}),
					}),
					...(persistedRejectionFeedbackSentAt
						? {
								rejectionFeedbackSentAt: persistedRejectionFeedbackSentAt,
							}
						: {}),
					...((rejectionReason || persistedRejectionFeedbackSentAt)
						? { rejectionRiskFlags: rejectionRiskFlags.length ? rejectionRiskFlags : null }
						: {}),
				})
			}

			if (rejectionReason?.isNewReason) {
				try {
					await createOutboxWriter(infra).write({
						type: 'candidatura_reprovada',
						companyId,
						payload: {
							applicationId: jobAppliedId || interviewId,
							jobId: postJobId,
							rejectionReasonCode: rejectionReason.code,
							rejectionReasonLabel: rejectionReason.label,
							rejectedByUserId,
							occurredAt: now,
						},
					})
				} catch (error) {
					console.error('[Kanban] failed to write candidatura_reprovada event:', error)
				}
			}

			if (persistedRejectionFeedbackSentAt) {
				try {
					await createOutboxWriter(infra).write({
						type: 'feedback_enviado',
						companyId,
						payload: {
							applicationId: jobAppliedId || interviewId,
							jobId: postJobId,
							channel: 'email',
							sentAt: persistedRejectionFeedbackSentAt.toISOString(),
							occurredAt: now,
						},
					})
				} catch (error) {
					console.error('[Kanban] failed to write feedback_enviado event:', error)
				}
			}

			/*
			 * Timeline (V2-303) também no movimento de UM candidato.
			 *
			 * Só o `bulkUpdateStatus` registrava — e mover um card por vez é o que
			 * se faz o dia inteiro no quadro, enquanto a ação em massa é exceção.
			 * O resultado era um histórico que dizia "Nada registrado ainda" para
			 * candidatos movidos várias vezes: o registro existia no código e não
			 * cobria o caminho por onde as pessoas passam.
			 *
			 * Fora de transação e sem `await` de propósito, igual ao caminho em
			 * massa: histórico não pode derrubar a movimentação, que é a operação
			 * que o recrutador de fato pediu.
			 */
			void createCandidateTimelineService(infra).recordEvent({
				companyId,
				jobId: postJobId,
				candidateId: interviewId,
				type: 'stage_changed',
				body: rejectionReason?.label ?? null,
				metadata: {
					to: candidateStatus,
					source: 'single',
					...(rejectionReason ? { reasonCode: rejectionReason.code } : {}),
				},
				authorId: rejectedByUserId ?? null,
				authorName: actorName ?? null,
			})

			return { message: 'Interview status updated successfully', interview_id: interviewId, candidate_status: candidateStatus }
		},

		/** Toggle like/dislike on a candidate */
		async toggleCandidateLike(params: {
			userId: string
			jobAppliedId: string
			action: 'like' | 'dislike'
			currentUserId: string
			companyId: string
			currentUser: UsersCompany | null
		}) {
			const { userId, jobAppliedId, action, currentUserId, companyId, currentUser } = params

			const jobApplied = await infra.candidateRepository.getJobApplied(userId, jobAppliedId) as JobApplied | null
			if (!jobApplied) throw new BadRequestError('Job application not found')

			const existingLikes = await infra.candidateRepository.listCandidateLikes(userId, jobAppliedId) as CandidateLike[]
			const filteredLikes = existingLikes.filter((like) => like.user_id === currentUserId)

			let liked = false

			const userName = currentUser?.display_name
				|| `${currentUser?.first_name ?? ''} ${currentUser?.last_name ?? ''}`.trim()
				|| currentUser?.email || 'Usuario'

			if (filteredLikes.length > 0) {
				const existingLike = filteredLikes[0]
				if ((action === 'like' && existingLike.action === true) || (action === 'dislike' && existingLike.action === false)) {
					await infra.candidateRepository.deleteCandidateLike(userId, jobAppliedId, existingLike.id)
				} else {
					for (const like of filteredLikes) {
						await infra.candidateRepository.deleteCandidateLike(userId, jobAppliedId, like.id)
					}
					await infra.candidateRepository.createCandidateLike(userId, jobAppliedId, {
						user_id: currentUserId, name: userName, avatar_url: currentUser?.photo_url || '', email: currentUser?.email || '',
						created_at: new Date(), action: action === 'like',
					})
					liked = action === 'like'
				}
			} else {
				await infra.candidateRepository.createCandidateLike(userId, jobAppliedId, {
					user_id: currentUserId, name: userName, avatar_url: currentUser?.photo_url || '', email: currentUser?.email || '',
					created_at: new Date(), action: action === 'like',
				})
				liked = action === 'like'
			}

			// Fetch updated likes
			const allLikes = await infra.candidateRepository.listCandidateLikes(userId, jobAppliedId) as CandidateLike[]
			const totalLikes = allLikes.filter((like) => like.action === true || like.action === undefined).length
			const totalDislikes = allLikes.filter((like) => like.action === false).length

			// Update likes/dislikes count on interview
			const postJobId = jobApplied.jobApplied?.id ?? ''
			if (postJobId) {
				const interviews = await infra.candidateRepository.listJobInterviews(companyId, postJobId, {
					filters: [{ field: 'job_applied_ref.id', operator: '==', value: jobAppliedId }],
				}) as Interview[]

				if (interviews.length > 0) {
					await infra.candidateRepository.updateJobInterview(companyId, postJobId, interviews[0].id, { likes: totalLikes, dislikes: totalDislikes } as unknown as UpdateInput<JobApplied>)
				}
			}

			return {
				liked,
				likes: allLikes.map((like) => ({ ...like, created_at: toDate(like.created_at), action: like?.action ?? true })),
				totalLikes,
				totalDislikes,
			}
		},
		// ─── Direct repository accessors (for route migration) ───────────────────

		async getUsersCompany(userId: string) {
			return infra.userRepository.getUsersCompany(userId)
		},

		async getJobApplied(userId: string, jobAppliedId: string) {
			return infra.candidateRepository.getJobApplied(userId, jobAppliedId)
		},

		async listCompanyInterviews(companyId: string, options?: Parameters<typeof infra.candidateRepository.listCompanyInterviews>[1]) {
			return infra.candidateRepository.listCompanyInterviews(companyId, options)
		},

		applyListingScoreMask,
	}
}
