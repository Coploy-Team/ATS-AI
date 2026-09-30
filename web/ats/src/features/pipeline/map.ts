import type { empresa } from '@coploy/sdk'

import { normalizeStageKey } from '@/features/jobs/stages'
import { normalizeScore } from '@/lib/score'

type CandidateDto = empresa.GetCompaniesJobsJobIdCandidates200CandidatesItem

/** Anticorrupção do board: o DTO é o CompanyInterview legado (chaves mistas). */
export interface PipelineCard {
	id: string
	name: string
	occupation: string | null
	photoUrl: string | null
	/** 0–10; null quando a entrevista ainda não pontuou. */
	score: number | null
	stage: string
	/** Há quanto tempo está NESTA etapa (ms) — o sinal anti-ghosting do card. */
	inStageMs: number | null
	/** Há quanto tempo está NO PROCESSO (ms), desde a candidatura. */
	inProcessMs: number | null
	finished: boolean
	/**
	 * Perguntas respondidas — `null` em registro anterior ao espelhamento.
	 *
	 * O orchestrator passou a gravar isto no `companyInterviews` a cada resposta
	 * (`syncJobAppliedViews`). Candidaturas antigas não têm o campo, e aí o card
	 * usa o texto neutro em vez de afirmar "não iniciou" — que seria falso para
	 * quem parou no meio antes desta mudança.
	 */
	answeredCount: number | null
	/** Nota bloqueada por crédito (SaaS) — não é "sem nota ainda". */
	locked: boolean
	/** 0–10; sinal de autenticidade da entrevista, quando existe. */
	authenticity: number | null
	userId: string | null
	jobAppliedId: string | null
}

export function toPipelineCard(dto: CandidateDto): PipelineCard {
	// `date_select` é gravado a cada mudança de status; sem ele, o candidato
	// nunca foi movido e o relógio conta desde a candidatura.
	const since = dto.date_select ?? dto.date
	const sinceMs = since ? new Date(since).getTime() : null

	const applied = dto.date ? new Date(dto.date).getTime() : null

	return {
		id: dto.id,
		name: dto.name?.trim() || '—',
		occupation: dto.occupation?.trim() || null,
		photoUrl: dto.photo_url?.trim() || null,
		score: normalizeScore(dto.score),
		stage: normalizeStageKey(dto.candidateStatus ?? ''),
		inStageMs: sinceMs && !Number.isNaN(sinceMs) ? Math.max(0, Date.now() - sinceMs) : null,
		inProcessMs: applied && !Number.isNaN(applied) ? Math.max(0, Date.now() - applied) : null,
		finished: dto.finished === true,
		// 0 é informação ("não iniciou"); ausente é desconhecido
		answeredCount: typeof dto.answeredCount === 'number' ? dto.answeredCount : null,
		locked: (dto as unknown as { locked?: boolean }).locked === true,
		authenticity: normalizeScore((dto as unknown as { authenticityScore?: unknown }).authenticityScore),
		userId: dto.user_ref ?? null,
		jobAppliedId: dto.job_applied_ref ?? null,
	}
}
