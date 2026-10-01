import type { ProcessFeedback } from '@coploy/domain'

/** Retornos do processo ao talento (OTS 0.3). Só escrita e leitura: retorno enviado não se edita. */
export interface ProcessFeedbackRepository {
	create(feedback: ProcessFeedback): Promise<void>
	/** Os retornos de uma candidatura, do mais novo para o mais antigo. */
	listByApplication(companyId: string, jobAppliedId: string): Promise<ProcessFeedback[]>
	/** Todos os retornos do talento, do mais novo para o mais antigo. */
	listByUser(userId: string): Promise<ProcessFeedback[]>
	deleteByUser(userId: string): Promise<void>
}
