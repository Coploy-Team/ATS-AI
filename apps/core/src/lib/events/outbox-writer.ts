import { randomUUID } from 'node:crypto'
import type { DomainEvent } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'
import { BadRequestError } from '@coploy/shared/errors'
import {
	eventCatalog,
	isKnownEventType,
	type DomainEventPayload,
	type DomainEventType,
} from './event-catalog'

export type WriteOutboxParams<TType extends DomainEventType = DomainEventType> = {
	id?: string
	type: TType
	schemaVersion?: string
	companyId: string
	payload: DomainEventPayload<TType>
}

export function createOutboxWriter(infra: InfraProvider) {
	const repo = infra.outboxRepository

	return {
		async write<TType extends DomainEventType>(
			params: WriteOutboxParams<TType>,
		): Promise<DomainEvent> {
			if (!params.companyId) throw new BadRequestError('companyId is required')
			if (!params.type) throw new BadRequestError('event type is required')
			if (!isKnownEventType(params.type)) {
				throw new BadRequestError(`Unknown domain event type: ${params.type}`)
			}

			const parsed = eventCatalog[params.type].safeParse(params.payload)
			if (!parsed.success) {
				throw new BadRequestError(
					`Invalid payload for ${params.type}: ${parsed.error.issues
						.map((issue) => issue.path.join('.') || issue.message)
						.join(', ')}`,
				)
			}

			return repo.insert({
				id: params.id ?? randomUUID(),
				type: params.type,
				schemaVersion: params.schemaVersion ?? '1',
				companyId: params.companyId,
				payload: parsed.data,
			})
		},
	}
}
