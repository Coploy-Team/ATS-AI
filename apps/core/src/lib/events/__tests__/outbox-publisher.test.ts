import type { DomainEvent } from '@coploy/domain'
import { createMockInfra } from '../../services/__tests__/mock-infra'
import { createOutboxPublisher } from '../outbox-publisher'

const EVENT: DomainEvent = {
	id: 'event-1',
	type: 'vaga_publicada',
	schemaVersion: '1',
	companyId: 'company-1',
	payload: { jobId: 'job-1' },
	createdAt: '2026-08-12T10:00:00.000Z',
	status: 'pending',
	retryCount: 0,
}

const EVENT_2: DomainEvent = {
	...EVENT,
	id: 'event-2',
	type: 'candidatura_reprovada',
	payload: { candidaturaId: 'candidate-1', reasonCode: 'not_a_fit' },
}

describe('createOutboxPublisher', () => {
	it('no-ops when there are no pending events', async () => {
		const infra = createMockInfra()
		infra.outboxRepository.claimPending.mockResolvedValue([])

		const result = await createOutboxPublisher(infra).pollAndPublish()

		expect(result).toEqual({ polled: 0, published: 0, failed: 0, delivered: 0 })
		expect(infra.pubsub.publish).not.toHaveBeenCalled()
		expect(infra.outboxRepository.markPublished).not.toHaveBeenCalled()
		expect(infra.outboxRepository.markFailed).not.toHaveBeenCalled()
	})

	it('publishes pending events with event id as message key and marks published', async () => {
		const infra = createMockInfra()
		infra.outboxRepository.claimPending.mockResolvedValue([EVENT])
		infra.pubsub.publish.mockResolvedValue('message-1')
		infra.outboxRepository.markPublished.mockResolvedValue({
			...EVENT,
			status: 'published',
			publishedAt: '2026-08-12T10:00:01.000Z',
		})

		const result = await createOutboxPublisher(infra).pollAndPublish({
			topic: 'topic-1',
			limit: 10,
			ensureTopic: true,
		})

		expect(result).toEqual({ polled: 1, published: 1, failed: 0, delivered: 0 })
		expect(infra.pubsub.ensureTopicExists).toHaveBeenCalledWith('topic-1')
		expect(infra.outboxRepository.claimPending).toHaveBeenCalledWith(10)
		expect(infra.pubsub.publish).toHaveBeenCalledWith('topic-1', EVENT, {
			messageKey: 'event-1',
			eventId: 'event-1',
			eventType: 'vaga_publicada',
			companyId: 'company-1',
			schemaVersion: '1',
		})
		expect(infra.outboxRepository.markPublished).toHaveBeenCalledWith('event-1')
		expect(infra.outboxRepository.markFailed).not.toHaveBeenCalled()
	})

	it('keeps publishing the batch when one event fails', async () => {
		const infra = createMockInfra()
		infra.outboxRepository.claimPending.mockResolvedValue([EVENT, EVENT_2])
		infra.pubsub.publish
			.mockRejectedValueOnce(new Error('pubsub unavailable'))
			.mockResolvedValueOnce('message-2')
		infra.outboxRepository.markFailed.mockResolvedValue({
			...EVENT,
			status: 'failed',
			retryCount: 1,
			lastError: 'pubsub unavailable',
		})
		infra.outboxRepository.markPublished.mockResolvedValue({
			...EVENT_2,
			status: 'published',
			publishedAt: '2026-08-12T10:00:02.000Z',
		})

		const result = await createOutboxPublisher(infra).pollAndPublish()

		expect(result).toEqual({ polled: 2, published: 1, failed: 1, delivered: 0 })
		expect(infra.outboxRepository.markFailed).toHaveBeenCalledWith(
			'event-1',
			'pubsub unavailable',
		)
		expect(infra.outboxRepository.markPublished).toHaveBeenCalledWith('event-2')
	})

	it('does not publish twice when a drain is already in flight', async () => {
		const infra = createMockInfra()
		let resolveClaim: (events: DomainEvent[]) => void = () => {}
		infra.outboxRepository.claimPending.mockReturnValue(
			new Promise((resolve) => {
				resolveClaim = resolve
			}),
		)
		infra.pubsub.publish.mockResolvedValue('message-1')
		infra.outboxRepository.markPublished.mockResolvedValue({
			...EVENT,
			status: 'published',
		})

		const publisher = createOutboxPublisher(infra)
		const first = publisher.pollAndPublish()
		const second = publisher.pollAndPublish()
		resolveClaim([EVENT])

		await expect(second).resolves.toEqual({ polled: 0, published: 0, failed: 0, delivered: 0 })
		await expect(first).resolves.toEqual({ polled: 1, published: 1, failed: 0, delivered: 0 })
		expect(infra.pubsub.publish).toHaveBeenCalledTimes(1)
		expect(infra.outboxRepository.claimPending).toHaveBeenCalledTimes(1)
	})
})
