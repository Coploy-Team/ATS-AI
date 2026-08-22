/**
 * Linha do tempo do candidato (V2-303).
 *
 * Hoje não há registro de "o que aconteceu com essa pessoa": quem moveu, quando,
 * por quê, e o que os recrutadores conversaram a respeito. Dois recrutadores na
 * mesma vaga não conseguem se falar dentro do sistema — a conversa vai para o
 * WhatsApp e some.
 *
 * Dois tipos de entrada convivem: EVENTO (gerado pelo sistema, imutável) e
 * COMENTÁRIO (escrito por gente, editável pelo autor). Misturá-los na mesma
 * lista é o que dá contexto — "reprovado" sem o comentário de quem reprovou é
 * metade da história.
 */

export const TIMELINE_EVENT_TYPES = [
	'stage_changed',
	'interview_finished',
	'email_sent',
	'profile_requested',
	'scorecard_added',
	'comment',
] as const
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number]

export interface CandidateTimelineEntry {
	id: string
	companyId: string
	jobId: string
	candidateId: string
	type: TimelineEventType
	/** Autor humano; `null` em evento de sistema. */
	authorId?: string | null
	authorName?: string | null
	/** Texto do comentário, ou descrição curta do evento. */
	body?: string | null
	/**
	 * Dados do evento (etapa origem/destino, motivo, id da entrevista…).
	 * Livre de propósito: cada tipo carrega o que precisa e a tela decide.
	 */
	metadata?: Record<string, unknown> | null
	createdAt: Date | string
	updatedAt?: Date | string | null
}

/** Comentário é a única entrada que o autor pode editar ou apagar. */
export function isEditableEntry(entry: Pick<CandidateTimelineEntry, 'type'>): boolean {
	return entry.type === 'comment'
}
