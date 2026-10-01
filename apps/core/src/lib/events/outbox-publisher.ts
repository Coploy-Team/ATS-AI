import type { DomainEvent } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

import { createDomainEventDispatcher } from './domain-event-dispatcher'

export const DEFAULT_OUTBOX_TOPIC = 'talent-domain-events'
export const DEFAULT_OUTBOX_BATCH_LIMIT = 50

export type OutboxPublisherOptions = {
	topic?: string
	limit?: number
	ensureTopic?: boolean
}

export type OutboxPublisherResult = {
	polled: number
	published: number
	failed: number
	/** Entregas disparadas em webhooks de cliente que assinaram o tipo. */
	delivered: number
}

/**
 * Replay operacional: re-marque um evento `failed`/`published` como `pending`
 * no outbox e rode este publisher de novo. Consumidores devem deduplicar por id.
 */
export function createOutboxPublisher(infra: InfraProvider) {
	const repo = infra.outboxRepository
	let drainInFlight = false

	async function publishOne(event: DomainEvent, topic: string): Promise<void> {
		await infra.pubsub.publish(topic, event, {
			messageKey: event.id,
			eventId: event.id,
			eventType: event.type,
			companyId: event.companyId,
			schemaVersion: event.schemaVersion,
		})
		await repo.markPublished(event.id)
	}

	return {
		async pollAndPublish(options: OutboxPublisherOptions = {}): Promise<OutboxPublisherResult> {
			if (drainInFlight) {
				return { polled: 0, published: 0, failed: 0, delivered: 0 }
			}

			drainInFlight = true
			const topic = options.topic ?? DEFAULT_OUTBOX_TOPIC
			// dispatcher por drain: o cache de webhooks por empresa morre com o lote
			const dispatcher = createDomainEventDispatcher(infra)

			try {
				if (options.ensureTopic) {
					await infra.pubsub.ensureTopicExists(topic)
				}

				const events = await repo.claimPending(options.limit ?? DEFAULT_OUTBOX_BATCH_LIMIT)
				let published = 0
				let failed = 0
				let delivered = 0

				for (const event of events) {
					try {
						await publishOne(event, topic)
						published += 1
						/*
						 * Entrega externa DEPOIS do markPublished e sem await no
						 * resultado do publish: o evento já está no barramento, e
						 * webhook de cliente fora do ar não pode reabrir o outbox.
						 */
						delivered += await dispatcher.dispatch(event)
					} catch (err) {
						failed += 1
						const message = err instanceof Error ? err.message : String(err)
						await repo.markFailed(event.id, message)
					}
				}

				return {
					polled: events.length,
					published,
					failed,
					delivered,
				}
			} finally {
				drainInFlight = false
			}
		},
	}
}
