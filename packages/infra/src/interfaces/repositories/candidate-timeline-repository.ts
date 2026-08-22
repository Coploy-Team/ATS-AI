import type { CandidateTimelineEntry, CreateInput } from '@coploy/domain'

/** Linha do tempo do candidato (V2-303). */
export interface CandidateTimelineRepository {
	listTimeline(
		companyId: string,
		jobId: string,
		candidateId: string,
	): Promise<CandidateTimelineEntry[]>
	appendEntry(
		companyId: string,
		data: CreateInput<CandidateTimelineEntry>,
	): Promise<CandidateTimelineEntry & { id: string }>
	updateEntry(companyId: string, id: string, body: string): Promise<void>
	deleteEntry(companyId: string, id: string): Promise<void>
}
