import type { ConsentRecord, CreateInput, DataSubjectRequest } from '@coploy/domain'

/** Consentimento e trilha de operações sobre dado pessoal (V2-701). */
export interface LgpdRepository {
	/** Consentimentos do titular. Histórico completo — revogado não some. */
	listConsents(userId: string): Promise<ConsentRecord[]>
	createConsent(data: CreateInput<ConsentRecord>): Promise<ConsentRecord & { id: string }>
	revokeConsent(id: string, revokedAt: Date): Promise<void>

	/** Trilha de auditoria. Append-only por natureza: apagar prova é o oposto do ponto. */
	listRequests(userId: string): Promise<DataSubjectRequest[]>
	createRequest(data: CreateInput<DataSubjectRequest>): Promise<DataSubjectRequest & { id: string }>
	completeRequest(
		id: string,
		data: { status: 'completed' | 'failed'; affected?: Record<string, number>; error?: string },
	): Promise<void>
}
