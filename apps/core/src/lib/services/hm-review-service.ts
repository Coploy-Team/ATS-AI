import { randomBytes } from 'node:crypto'

import type { CandidateEvaluation, InterviewData, InterviewInfoItem, JobApplied } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { REJECTION_REASONS } from '@coploy/domain'
import { BadRequestError, UnauthorizedError } from '@coploy/shared/errors'
import { env } from '@/env'
import { createInterviewsService } from '@/lib/services/interviews-service'
import { createJobsService } from '@/lib/services/jobs-service'
import { toDate } from '@/lib/date-formatter'
import type { Interview } from '@/types/interviews'

/**
 * Portal leve do hiring manager (TOS-030 / TOS-031 / GAP 3).
 *
 * Espelha `interview-handoff`: ticket opaco, TTL curto, consumo atômico no
 * resgate. Após o resgate, um accessCode autoriza shortlist + decisões sem OAuth.
 * Reprovação reusa `interviews-service.updateInterviewStatus` (TOS-025) com
 * `rejectionDecisionSource: 'manual'` — não concede revisão LGPD.
 *
 * TOS-031: shortlist curada com o mesmo dado que o recruiter vê no detalhe
 * (JobApplied.interview / avaliacaoFinal) — sem análise-IA crua nem
 * competências adicionais.
 */

const INVITE_TTL_SECONDS = 24 * 60 * 60
const CODE_BYTES = 32
const APPROVE_SCORE_THRESHOLD = 7

const INVALID_TOKEN_MESSAGE = 'Invalid or expired review token'

export type HmReviewCompetency = { label: string; score: number }
export type HmReviewQuestion = {
	question: string
	videoUrl: string | null
	score: number | null
	feedback: string | null
}

function parseScore(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string' && value.trim()) {
		const n = Number.parseFloat(value)
		return Number.isFinite(n) ? n : null
	}
	return null
}

/**
 * Mesma régua do dashboard (`web/dashboard/.../formatters.ts`).
 * Com `maxScore` (<10): score_detalhado vem em 0..maxScore (=10/n).
 * Sem `maxScore`: 0–1 → ×10; senão assume 0–10 (avaliacaoFinal.pontuacao).
 */
function convertCompetencyScore(
	value: number | string | null | undefined,
	options?: { maxScore?: number },
): number {
	if (value === null || value === undefined || value === '') return 0
	const numericValue = typeof value === 'string' ? Number.parseFloat(value) : value
	if (!Number.isFinite(numericValue)) return 0

	const maxScore = options?.maxScore
	if (
		typeof maxScore === 'number' &&
		Number.isFinite(maxScore) &&
		maxScore > 0 &&
		maxScore < 10 &&
		numericValue >= 0 &&
		numericValue <= maxScore + 1e-9
	) {
		return Math.round((numericValue / maxScore) * 10)
	}

	if (numericValue <= 1) return Math.round(numericValue * 10)
	return Math.round(numericValue)
}

/** maxScore por pergunta no ai-engine: 10 / nPerguntas principais. */
function questionMaxScore(infoLength: number): number | undefined {
	if (infoLength < 2) return undefined
	return 10 / infoLength
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function resolveJobAppliedId(interview: Interview): string | null {
	return interview.job_applied_ref?.id || interview.id || null
}

function suggestAction(score: number | null): 'approve' | 'reject' | 'review' {
	if (score == null) return 'review'
	if (score >= APPROVE_SCORE_THRESHOLD) return 'approve'
	return 'reject'
}

function pickSummary(
	interview: InterviewData | null | undefined,
	avaliacao: CandidateEvaluation | null | undefined,
): string | null {
	const candidates = [
		interview?.generalFeedback,
		interview?.recomentation,
		avaliacao?.generalFeedback,
		avaliacao?.resumo,
	]
	for (const value of candidates) {
		if (typeof value === 'string' && value.trim()) return value.trim()
	}
	return null
}

function pickStrengths(
	interview: InterviewData | null | undefined,
	avaliacao: CandidateEvaluation | null | undefined,
): string[] {
	const fromInterview = asStringArray(interview?.generalStrengths)
	if (fromInterview.length > 0) return fromInterview
	return asStringArray(avaliacao?.recomendacoes?.pontos_fortes)
}

/**
 * Pontos a desenvolver — NÃO usa `interview.generalImprovement`
 * (requisito não atendido da vaga, não conselho). Espelha
 * `avaliacaoFinal.recomendacoes` que o recruiter usa nas recomendações.
 */
function pickToDevelop(avaliacao: CandidateEvaluation | null | undefined): string[] {
	const areas = asStringArray(avaliacao?.recomendacoes?.areas_desenvolvimento)
	if (areas.length > 0) return areas
	return asStringArray(avaliacao?.recomendacoes?.sugestoes_melhoria)
}

function pickCompetencies(
	interview: InterviewData | null | undefined,
	avaliacao: CandidateEvaluation | null | undefined,
): HmReviewCompetency[] {
	const fromFinal = avaliacao?.competencias_criticas
	if (Array.isArray(fromFinal) && fromFinal.length > 0) {
		const list: HmReviewCompetency[] = []
		for (const item of fromFinal) {
			const label =
				(typeof item.nome === 'string' && item.nome.trim()) ||
				(typeof (item as { competencia?: unknown }).competencia === 'string'
					? String((item as { competencia?: string }).competencia).trim()
					: '')
			if (!label) continue
			// Preferir pontuacao (0–10 no avaliacaoFinal) quando existir — score
			// legado às vezes guarda peso/escala curta e gerava barras ~2/10.
			const raw = item.pontuacao ?? item.score
			list.push({
				label,
				score: convertCompetencyScore(raw),
			})
		}
		if (list.length > 0) return list
	}

	// Agrega barras por pergunta (só competências críticas — sem adicionais).
	const infoList = interview?.info ?? []
	const maxScore = questionMaxScore(infoList.length)
	const aggregates = new Map<string, { sum: number; count: number }>()
	for (const info of infoList) {
		const detalhado = info.score_detalhado as
			| { competencias_criticas?: Array<{ competencia?: string; nome?: string; score?: number; pontuacao?: number }> }
			| null
			| undefined
		const criticas = detalhado?.competencias_criticas
		if (!Array.isArray(criticas)) continue
		for (const comp of criticas) {
			const label = (comp.competencia || comp.nome || '').trim()
			if (!label) continue
			const score = convertCompetencyScore(comp.score ?? comp.pontuacao, { maxScore })
			const prev = aggregates.get(label) ?? { sum: 0, count: 0 }
			aggregates.set(label, { sum: prev.sum + score, count: prev.count + 1 })
		}
	}

	return [...aggregates.entries()].map(([label, { sum, count }]) => ({
		label,
		score: Math.round(sum / count),
	}))
}

function mapInfoItem(item: InterviewInfoItem): HmReviewQuestion {
	const feedbackRaw = item.qRecomendation || item.feedback
	return {
		question: typeof item.question === 'string' ? item.question : '',
		videoUrl: typeof item.video === 'string' && item.video.length > 0 ? item.video : null,
		score: parseScore(item.score),
		feedback: typeof feedbackRaw === 'string' && feedbackRaw.trim() ? feedbackRaw.trim() : null,
	}
}

function pickQuestions(interview: InterviewData | null | undefined): HmReviewQuestion[] {
	if (!interview) return []
	const main = Array.isArray(interview.info) ? interview.info.map(mapInfoItem) : []
	const additionalRaw =
		interview.additional ||
		(interview as { addicional?: InterviewInfoItem[] }).addicional ||
		[]
	const additional = Array.isArray(additionalRaw)
		? additionalRaw.map((item) => mapInfoItem(item as InterviewInfoItem))
		: []
	return [...main, ...additional].filter((q) => q.question.trim().length > 0 || q.videoUrl)
}

function extractCuratedDetail(jobApplied: JobApplied | null): {
	summary: string | null
	strengths: string[]
	toDevelop: string[]
	competencies: HmReviewCompetency[]
	questions: HmReviewQuestion[]
} {
	const interview = jobApplied?.interview ?? null
	const avaliacao = jobApplied?.avaliacaoFinal ?? null
	return {
		summary: pickSummary(interview, avaliacao),
		strengths: pickStrengths(interview, avaliacao),
		toDevelop: pickToDevelop(avaliacao),
		competencies: pickCompetencies(interview, avaliacao),
		questions: pickQuestions(interview),
	}
}

export function createHiringManagerReviewService(infra: InfraProvider) {
	const jobsService = createJobsService(infra)
	const interviewsService = createInterviewsService(infra)

	async function resolveAccess(accessToken: string) {
		const token = await infra.hmReviewTokenRepository.getByAccessCode(accessToken)
		if (!token) {
			throw new UnauthorizedError(INVALID_TOKEN_MESSAGE)
		}
		return token
	}

	return {
		async issue(params: {
			companyId: string
			jobId: string
			jobAppliedIds: string[]
			createdByUserId: string
		}): Promise<{ code: string; expiresAt: Date; url: string }> {
			const uniqueIds = [...new Set(params.jobAppliedIds.map((id) => id.trim()).filter(Boolean))]
			if (uniqueIds.length < 1) {
				throw new BadRequestError('jobAppliedIds must include at least one candidate')
			}
			if (uniqueIds.length > 50) {
				throw new BadRequestError('jobAppliedIds cannot exceed 50 candidates')
			}

			const job = await jobsService.getJob(params.companyId, params.jobId)
			if (!job) {
				throw new BadRequestError('Job not found')
			}

			const interviews = (await jobsService.listJobInterviews(params.companyId, params.jobId, {
				filters: [{ field: 'finished', operator: '==', value: true }],
			})) as Interview[]

			const allowed = new Set(
				interviews
					.map((interview) => resolveJobAppliedId(interview))
					.filter((id): id is string => Boolean(id)),
			)

			for (const id of uniqueIds) {
				if (!allowed.has(id)) {
					throw new BadRequestError(`jobAppliedId out of scope for this job: ${id}`)
				}
			}

			const code = randomBytes(CODE_BYTES).toString('base64url')
			const expiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000)

			await infra.hmReviewTokenRepository.createReviewToken(code, {
				companyId: params.companyId,
				jobId: params.jobId,
				jobAppliedIds: uniqueIds,
				createdByUserId: params.createdByUserId,
				expiresAt,
			})

			const base = env.INTERVIEW_BASE_URL.replace(/\/+$/, '')
			return {
				code,
				expiresAt,
				url: `${base}/hm-review/${encodeURIComponent(code)}`,
			}
		},

		/**
		 * Resgata o convite e devolve accessToken de sessão.
		 * Consumo atômico no repositório — corrida ou replay não passam.
		 */
		async redeem(code: string): Promise<{
			accessToken: string
			companyId: string
			jobId: string
			expiresAt: string
		}> {
			const accessToken = randomBytes(CODE_BYTES).toString('base64url')
			const accessExpiresAt = new Date(Date.now() + INVITE_TTL_SECONDS * 1000)
			const token = await infra.hmReviewTokenRepository.consumeReviewToken(
				code,
				accessToken,
				accessExpiresAt,
			)
			if (!token) {
				throw new UnauthorizedError(INVALID_TOKEN_MESSAGE)
			}

			const expiresAt = token.accessExpiresAt ?? token.expiresAt ?? accessExpiresAt
			return {
				accessToken,
				companyId: token.companyId,
				jobId: token.jobId,
				expiresAt: expiresAt.toISOString(),
			}
		},

		async getShortlist(accessToken: string) {
			const token = await resolveAccess(accessToken)
			const job = await jobsService.getJob(token.companyId, token.jobId)
			if (!job) {
				throw new BadRequestError('Job not found')
			}

			const allowed = new Set(token.jobAppliedIds)
			const interviews = (await jobsService.listJobInterviews(token.companyId, token.jobId, {
				filters: [{ field: 'finished', operator: '==', value: true }],
			})) as Interview[]

			const scoped = interviews.filter((interview) => {
				const jobAppliedId = resolveJobAppliedId(interview)
				return Boolean(jobAppliedId && allowed.has(jobAppliedId))
			})

			const candidates = (
				await Promise.all(
					scoped.map(async (interview) => {
						const jobAppliedId = resolveJobAppliedId(interview)
						if (!jobAppliedId) return null

						const score = parseScore(interview.score)
						const raw = interview as Interview & {
							display_name?: string | null
							candidateStatus?: string | null
							info?: Array<{ video?: string | null }>
						}

						const userId = interview.user_ref?.id
						let jobApplied: JobApplied | null = null
						if (userId) {
							jobApplied = (await jobsService.getJobApplied(userId, jobAppliedId)) as JobApplied | null
						}

						const curated = extractCuratedDetail(jobApplied)
						const firstVideoFromProjection = Array.isArray(raw.info)
							? raw.info.find((item) => typeof item?.video === 'string' && item.video.length > 0)?.video
							: null
						const firstVideo =
							curated.questions.find((q) => q.videoUrl)?.videoUrl ?? firstVideoFromProjection ?? null

						// Prévia no topo = 1º vídeo; não repetir o mesmo arquivo na lista.
						const questions =
							firstVideo == null
								? curated.questions
								: curated.questions.map((q) =>
										q.videoUrl === firstVideo ? { ...q, videoUrl: null } : q,
									)

						return {
							jobAppliedId,
							interviewId: interview.id,
							name: interview.name ?? raw.display_name ?? null,
							photoUrl: interview.photo_url ?? null,
							score,
							candidateStatus: interview.candidate_status ?? raw.candidateStatus ?? null,
							videoUrl: firstVideo,
							suggestedAction: suggestAction(score),
							date: (() => {
								const d = toDate(interview.date)
								return d ? d.toISOString() : null
							})(),
							summary: curated.summary,
							strengths: curated.strengths,
							toDevelop: curated.toDevelop,
							competencies: curated.competencies,
							questions,
						}
					}),
				)
			).filter((item): item is NonNullable<typeof item> => item != null)

			return {
				job: {
					id: job.id,
					jobName: job.jobName ?? '',
					identifier: job.identifier ?? undefined,
				},
				companyId: token.companyId,
				candidates,
				rejectionReasons: REJECTION_REASONS.map((reason) => ({
					code: reason.code,
					label: reason.label,
					requiresNote: Boolean(reason.requiresNote),
				})),
			}
		},

		async submitDecision(params: {
			accessToken: string
			jobAppliedId: string
			action: 'approve' | 'reject'
			rejectionReasonCode?: string
			rejectionNote?: string
			rejectionFeedbackMessage?: string
		}) {
			const token = await resolveAccess(params.accessToken)
			if (!token.jobAppliedIds.includes(params.jobAppliedId)) {
				throw new BadRequestError('Candidate is outside this review token scope')
			}

			const interviews = (await jobsService.listJobInterviews(token.companyId, token.jobId, {
				filters: [{ field: 'finished', operator: '==', value: true }],
			})) as Interview[]

			const interview = interviews.find((item) => resolveJobAppliedId(item) === params.jobAppliedId)
			if (!interview?.id) {
				throw new BadRequestError('Interview not found for this candidate')
			}

			const candidateStatus = params.action === 'approve' ? 'Approved' : 'Rejected'

			if (params.action === 'reject') {
				if (!params.rejectionReasonCode?.trim()) {
					throw new BadRequestError('rejectionReasonCode is required when rejecting candidates')
				}
				if (!params.rejectionFeedbackMessage?.trim()) {
					throw new BadRequestError('rejectionFeedbackMessage is required when rejecting candidates')
				}
			}

			return interviewsService.updateInterviewStatus({
				interviewId: interview.id,
				candidateStatus,
				postJobId: token.jobId,
				companyId: token.companyId,
				rejectionReasonCode: params.rejectionReasonCode,
				rejectionNote: params.rejectionNote,
				rejectionFeedbackMessage: params.rejectionFeedbackMessage,
				rejectedByUserId: token.createdByUserId ?? undefined,
			})
		},
	}
}

export type HiringManagerReviewService = ReturnType<typeof createHiringManagerReviewService>
