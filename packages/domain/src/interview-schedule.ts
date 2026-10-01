/**
 * Proposta de horário de entrevista (OTS 0.3, `schedule_interview`).
 *
 * A empresa PROPÕE janelas; o talento (ou o agente dele) escolhe UMA ou
 * recusa. Entrevista gravada por IA não se agenda — isto é a conversa com
 * gente (vídeo, telefone, presencial). O link ou endereço (`joinDetails`) é
 * guardado desde a proposta, mas só é mostrado ao talento depois da
 * confirmação: quem não confirmou não recebe link.
 */

export const SCHEDULE_FORMATS = ['video_call', 'phone', 'onsite'] as const
export type ScheduleFormat = (typeof SCHEDULE_FORMATS)[number]

export const SCHEDULE_STATUSES = ['proposed', 'confirmed', 'declined', 'expired', 'cancelled'] as const
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number]

export const SCHEDULE_DECLINE_REASONS = ['no_slot_fits', 'not_interested', 'accepted_other_offer', 'other'] as const
export type ScheduleDeclineReason = (typeof SCHEDULE_DECLINE_REASONS)[number]

/** Limites do protocolo (schema 0.3): 1–20 janelas, 5–480 minutos. */
export const SCHEDULE_LIMITS = { minSlots: 1, maxSlots: 20, minMinutes: 5, maxMinutes: 480 } as const

export interface ScheduleSlot {
	/** ISO 8601 com offset. */
	start: string
	end: string
}

export interface ScheduleJoinDetails {
	meetingUrl: string | null
	address: string | null
	instructions: string | null
}

export interface InterviewSchedule {
	id: string
	companyId: string
	jobId: string
	/** A participação do talento — é o `processEntryId` do protocolo. */
	jobAppliedId: string
	userId: string
	/** O card do quadro (`companyInterviews`), para o ATS achar a proposta. */
	candidateId: string
	format: ScheduleFormat
	durationMinutes: number
	/** Fuso IANA de referência para exibição. */
	timezone: string
	slots: ScheduleSlot[]
	status: ScheduleStatus
	confirmedSlot: ScheduleSlot | null
	expiresAt: string | null
	/** Mensagem da empresa ao talento. */
	note: string | null
	joinDetails: ScheduleJoinDetails | null
	declineReason: ScheduleDeclineReason | null
	declineNote: string | null
	respondedAt: string | null
	/** Quem respondeu: o próprio talento pela área dele, ou o agente pelo protocolo. */
	respondedVia: 'candidate_area' | 'agent' | null
	proposedBy: string | null
	proposedByName: string | null
	createdAt: string
	updatedAt: string
}

/**
 * O estado que vale AGORA: proposta aberta cujo prazo passou (ou cujas
 * janelas já começaram todas) é `expired`, mesmo que o banco ainda diga
 * `proposed` — a expiração é lida, não depende de um cron.
 */
export function effectiveScheduleStatus(schedule: Pick<InterviewSchedule, 'status' | 'expiresAt' | 'slots'>, now = new Date()): ScheduleStatus {
	if (schedule.status !== 'proposed') return schedule.status
	if (schedule.expiresAt && new Date(schedule.expiresAt).getTime() <= now.getTime()) return 'expired'
	const future = schedule.slots.some((slot) => new Date(slot.start).getTime() > now.getTime())
	return future ? 'proposed' : 'expired'
}
