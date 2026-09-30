/**
 * Requisição de vaga (V2-401).
 *
 * Em empresa média ninguém publica vaga sozinho: alguém REQUISITA (o gestor da
 * área, que tem a dor) e alguém APROVA (RH ou diretoria, que tem o orçamento).
 * Hoje o produto começa depois disso — então essa etapa acontece em e-mail e
 * planilha, e a Coploy só entra quando a decisão já foi tomada em outro lugar.
 *
 * ⚠️ Exigir requisição é OPT-IN por empresa. Ligar para todo mundo transformaria
 * a criação de vaga — hoje um clique — numa burocracia que a empresa pequena não
 * pediu e não quer.
 */

export const REQUISITION_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number]

export interface JobRequisition {
	id: string
	companyId: string
	/** Título pretendido — vira `jobName` quando a vaga é criada. */
	title: string
	/** Área/departamento em texto livre até a estrutura organizacional existir (V2-501). */
	area?: string | null
	/** Por que esta vaga existe: substituição, expansão, projeto novo. */
	reason?: string | null
	/** Quantas posições. Uma requisição pode gerar N contratações. */
	headcount: number
	salaryRangeMin?: number | null
	salaryRangeMax?: number | null
	currency?: string | null
	requestedByUserId: string
	requestedByName?: string | null
	status: RequisitionStatus
	/** Quem decidiu e quando — a aprovação precisa ter dono. */
	decidedByUserId?: string | null
	decidedByName?: string | null
	decidedAt?: Date | string | null
	/** Justificativa da recusa; obrigatória ao recusar. */
	decisionNote?: string | null
	/** Vaga criada a partir desta requisição, quando já publicada. */
	jobId?: string | null
	createdAt: Date | string
	updatedAt?: Date | string | null
}

/** Só requisição aprovada vira vaga — e só uma vez. */
export function canCreateJobFrom(requisition: Pick<JobRequisition, 'status' | 'jobId'>): boolean {
	return requisition.status === 'approved' && !requisition.jobId
}
