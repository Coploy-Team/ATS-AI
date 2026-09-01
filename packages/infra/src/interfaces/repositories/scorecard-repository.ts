import type { CreateInput, Scorecard, UpdateInput } from '@coploy/domain'

/**
 * Avaliações do recrutador (V2-302).
 *
 * Vive sob a empresa, como o resto do dado de tenant — isolamento continua por
 * `companyId` na app layer (decisão registrada; RLS nativo é dívida consciente).
 */
export interface ScorecardRepository {
	/** Todas as avaliações de um candidato numa vaga — vários avaliadores. */
	listScorecards(companyId: string, jobId: string, candidateId: string): Promise<Scorecard[]>
	/** A avaliação DESTE autor, para editar em vez de duplicar. */
	getScorecardByAuthor(
		companyId: string,
		jobId: string,
		candidateId: string,
		authorId: string,
	): Promise<Scorecard | null>
	createScorecard(companyId: string, data: CreateInput<Scorecard>): Promise<Scorecard & { id: string }>
	updateScorecard(companyId: string, id: string, data: UpdateInput<Scorecard>): Promise<void>
	deleteScorecard(companyId: string, id: string): Promise<void>
}
