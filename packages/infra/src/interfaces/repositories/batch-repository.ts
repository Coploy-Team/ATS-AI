import type { ListOptions } from '@coploy/domain'
import type { Batch, CreateInput, UpdateInput } from '@coploy/domain'

export interface BatchRepository {
	getBatch(id: string): Promise<Batch | null>
	listBatches(options?: ListOptions): Promise<Batch[]>
	createBatch(data: CreateInput<Batch>, customId?: string): Promise<Batch & { id: string }>
	updateBatch(id: string, data: UpdateInput<Batch>): Promise<void>
}