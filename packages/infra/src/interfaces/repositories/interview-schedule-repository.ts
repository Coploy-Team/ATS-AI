import type { InterviewSchedule } from '@coploy/domain'

/**
 * Propostas de horário de entrevista (OTS 0.3). Poucas por candidatura, então
 * as leituras são por igualdade simples e a ordem é feita em memória — sem
 * índice composto no Firestore.
 */
export interface InterviewScheduleRepository {
	create(schedule: InterviewSchedule): Promise<void>
	getById(id: string): Promise<InterviewSchedule | null>
	update(id: string, patch: Partial<InterviewSchedule>): Promise<InterviewSchedule | null>
	/** As propostas de uma candidatura, da mais nova para a mais antiga. */
	listByApplication(companyId: string, jobAppliedId: string): Promise<InterviewSchedule[]>
	/** Todas as propostas do talento, da mais nova para a mais antiga. */
	listByUser(userId: string): Promise<InterviewSchedule[]>
	deleteByUser(userId: string): Promise<void>
}
