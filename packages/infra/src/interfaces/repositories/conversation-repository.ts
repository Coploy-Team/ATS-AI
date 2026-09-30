import type { ListOptions } from '@coploy/domain';
import type { ConversationContext, CreateInput, UpdateInput } from '@coploy/domain';

export interface ConversationRepository {
	getConversationContext(
		phone: string,
		jobId: string,
	): Promise<ConversationContext | null>;
	listConversationContexts(
		phone: string,
		options?: ListOptions,
	): Promise<ConversationContext[]>;
	listAllConversationContexts(options?: ListOptions): Promise<ConversationContext[]>;
	createConversationContext(
		phone: string,
		jobId: string,
		data: CreateInput<ConversationContext>,
	): Promise<ConversationContext & { id: string }>;
	updateConversationContext(
		phone: string,
		jobId: string,
		data: UpdateInput<ConversationContext>,
	): Promise<void>;
	deleteConversationContext(phone: string, jobId: string): Promise<void>;
};