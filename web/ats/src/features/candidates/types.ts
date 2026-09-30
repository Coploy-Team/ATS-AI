/** Uma entrevista de uma pessoa, já normalizada para a tela. */
export interface CandidateRow {
	id: string
	/** Quem é a PESSOA — é por ele que as entrevistas se agrupam. */
	userId: string | null
	name: string
	email: string | null
	photoUrl: string | null
	occupation: string | null
	score: number | null
	stage: string
	jobId: string | null
	jobName: string | null
	waitingMs: number | null
}
