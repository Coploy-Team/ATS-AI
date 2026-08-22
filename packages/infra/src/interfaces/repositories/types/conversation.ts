export interface ConversationContext {
	id: string
	phone?: string | null
	currentQuestionId?: string | null
	step?: string | null
	interviewId?: string | null
	companyId?: string | null
	jobId?: string | null
	lastMessage?: string | null
	status?: string | null
	retryCount?: number | null
	maxRetries?: number | null
	email?: string | null
	password?: string | null
	createdAt?: Date | null
	updatedAt?: Date | null
}
