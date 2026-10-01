/**
 * Pesquisa de satisfação do candidato ao fim do processo.
 *
 * Vive fora de `billing.ts` desde 2026-08-29: NPS é sinal de produto, não de
 * cobrança — estava ali por acaso de arquivo, e esse acaso amarrava a pesquisa
 * ao modelo comercial em toda parte que precisava dela.
 */
export interface Nps {
	id: string
	companyId: string
	jobId: string
	jobName: string
	candidateId: string
	candidateName: string
	candidateEmail: string
	jobApplied: string
	photo_url?: string
	score: number
	comment: string
	interviewType: 'exitJob' | 'evaluation' | 'interview' | 'emotional'
	createdAt: Date
	updatedAt?: Date
	company?: { id: string; path?: string }
	job?: { id: string; path?: string }
	candidate?: { id: string; path?: string }
}
