/**
 * Retorno do processo ao talento (OTS 0.3, `submit_feedback`).
 *
 * O vocabulário do anti-ghosting virando protocolo: toda mudança que importa
 * para a pessoa chega com texto humano. É retorno, não veredito — nota,
 * aprovação e posição no ranking não existem aqui. O motivo só aparece quando
 * o processo termina para a pessoa, e só entre os que um candidato pode ver.
 */

import { getCandidateVisibility } from './rejection-reason'

export const PROCESS_FEEDBACK_STAGES = [
	'received',
	'in_review',
	'interview_scheduled',
	'advanced',
	'not_selected',
	'hired',
	'position_closed',
	'withdrawn',
] as const
export type ProcessFeedbackStage = (typeof PROCESS_FEEDBACK_STAGES)[number]

export const PROCESS_FEEDBACK_REASONS = [
	'requirements_not_met',
	'insufficient_experience',
	'salary_mismatch',
	'position_cancelled',
	'other_candidate_hired',
] as const
export type ProcessFeedbackReason = (typeof PROCESS_FEEDBACK_REASONS)[number]

/** Estágios em que o processo terminou para a pessoa — os únicos com motivo. */
export const PROCESS_FEEDBACK_CLOSING_STAGES: ProcessFeedbackStage[] = ['not_selected', 'position_closed']

export interface ProcessFeedback {
	id: string
	companyId: string
	jobId: string
	/** A participação do talento — é o `processEntryId` do protocolo. */
	jobAppliedId: string
	userId: string
	candidateId: string
	stage: ProcessFeedbackStage
	message: string
	reasonCode: ProcessFeedbackReason | null
	nextStep: string | null
	/** De onde veio: escrito pelo recrutador, ou o retorno da reprovação. */
	source: 'recruiter' | 'rejection'
	sentBy: string | null
	sentByName: string | null
	sentAt: string
}

/**
 * De-para da reprovação da Coploy para o motivo do protocolo (Anexo A da
 * spec 0.3). Motivo que o candidato não pode ver volta `null` — o texto do
 * retorno explica.
 */
const REASON_BY_REJECTION: Record<string, ProcessFeedbackReason> = {
	nao_atende_requisitos: 'requirements_not_met',
	experiencia_insuficiente: 'insufficient_experience',
	pretensao_salarial: 'salary_mismatch',
	posicao_cancelada: 'position_cancelled',
	contratado_outro: 'other_candidate_hired',
}

export function processReasonFromRejection(code: string | null | undefined): ProcessFeedbackReason | null {
	if (!code || getCandidateVisibility(code) === 'hidden') return null
	return REASON_BY_REJECTION[code] ?? null
}

/** Reprovação por posição cancelada é `position_closed` para a pessoa, não `not_selected`. */
export function processStageFromRejection(code: string | null | undefined): ProcessFeedbackStage {
	return code === 'posicao_cancelada' ? 'position_closed' : 'not_selected'
}
