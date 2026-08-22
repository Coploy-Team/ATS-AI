export interface Batch {
	id: string
	type?: string | null
	status?: string | null
	interviewId?: string | null
	userId?: string | null
	companyId?: string | null
	jobAppliedPath?: string | null
	engineBatchId?: string | null
	openaiBatchId?: string | null
	openaiFileId?: string | null
	openaiOutputFileId?: string | null
	totalItems?: number | null
	processedItems?: number | null
	totalTokensUsed?: number | null
	promptTokensUsed?: number | null
	completionTokensUsed?: number | null
	processingMode?: string | null
	requestedBy?: string | null
	error?: string | null
	/** Date (selfhosted) or Firestore Timestamp (GCP) */
	completedAt?: unknown
	/** Date (selfhosted) or Firestore Timestamp (GCP) */
	createdAt?: unknown
	/** Date (selfhosted) or Firestore Timestamp (GCP) */
	updatedAt?: unknown
}
