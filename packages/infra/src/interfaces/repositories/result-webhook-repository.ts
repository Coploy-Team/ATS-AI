import type { CreateInput, ResultWebhook, UpdateInput } from '@coploy/domain'

export type ResultWebhookRepository = {
	listByCompany(companyId: string): Promise<ResultWebhook[]>
	getById(id: string): Promise<ResultWebhook | null>
	create(
		data: CreateInput<ResultWebhook>,
		customId?: string,
	): Promise<ResultWebhook & { id: string }>
	update(id: string, data: UpdateInput<ResultWebhook>): Promise<void>
	delete(id: string): Promise<void>
}
