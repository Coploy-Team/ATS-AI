import { BadRequestError } from '@coploy/shared/errors'
import { createMockInfra } from '../../services/__tests__/mock-infra'
import { createOutboxWriter } from '../outbox-writer'

describe('createOutboxWriter', () => {
	it('validates payload and persists known event types', async () => {
		const infra = createMockInfra()
		infra.outboxRepository.insert.mockImplementation(async (input) => ({
			...input,
			id: input.id ?? 'event-1',
			createdAt: '2026-08-12T10:00:00.000Z',
			status: 'pending',
			retryCount: 0,
		}))

		const writer = createOutboxWriter(infra)
		const event = await writer.write({
			id: 'event-1',
			type: 'candidatura_criada',
			companyId: 'company-1',
			payload: {
				applicationId: 'application-1',
				jobId: 'job-1',
				candidateId: 'candidate-1',
			},
		})

		expect(event.id).toBe('event-1')
		expect(infra.outboxRepository.insert).toHaveBeenCalledWith({
			id: 'event-1',
			type: 'candidatura_criada',
			schemaVersion: '1',
			companyId: 'company-1',
			payload: {
				applicationId: 'application-1',
				jobId: 'job-1',
				candidateId: 'candidate-1',
			},
		})
	})

	it('rejects unknown event types before persisting', async () => {
		const infra = createMockInfra()
		const writer = createOutboxWriter(infra)

		await expect(
			writer.write({
				type: 'tipo_desconhecido',
				companyId: 'company-1',
				payload: { jobId: 'job-1' },
			} as never),
		).rejects.toBeInstanceOf(BadRequestError)
		expect(infra.outboxRepository.insert).not.toHaveBeenCalled()
	})

	it('rejects invalid payloads before persisting', async () => {
		const infra = createMockInfra()
		const writer = createOutboxWriter(infra)

		await expect(
			writer.write({
				type: 'feedback_enviado',
				companyId: 'company-1',
				payload: {
					applicationId: 'application-1',
					channel: 'sms',
					sentAt: '2026-08-12T10:00:00.000Z',
				},
			} as never),
		).rejects.toBeInstanceOf(BadRequestError)
		expect(infra.outboxRepository.insert).not.toHaveBeenCalled()
	})
})
