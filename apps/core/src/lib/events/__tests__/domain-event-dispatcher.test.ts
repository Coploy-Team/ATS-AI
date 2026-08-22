import type { DomainEvent } from '@coploy/domain'

import { createDomainEventDispatcher } from '../domain-event-dispatcher'

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
	return {
		id: 'evt-1',
		type: 'candidatura_movida',
		schemaVersion: '1',
		companyId: 'company-1',
		payload: { jobId: 'job-1' },
		createdAt: '2026-08-16T10:00:00.000Z',
		status: 'pending',
		...overrides,
	} as DomainEvent
}

function makeInfra(webhooks: Array<Record<string, unknown>>) {
	const created: Array<Record<string, unknown>> = []
	return {
		infra: {
			resultWebhookRepository: {
				listByCompany: jest.fn().mockResolvedValue(webhooks),
			},
			webhookDeliveryLogRepository: {
				create: jest.fn(async (data: Record<string, unknown>) => {
					created.push(data)
					return { ...data, id: 'log-1' }
				}),
			},
		} as never,
		created,
	}
}

describe('domain-event-dispatcher', () => {
	const originalFetch = global.fetch

	afterEach(() => {
		global.fetch = originalFetch
		jest.restoreAllMocks()
	})

	it('entrega apenas a quem assinou o tipo do evento', async () => {
		global.fetch = jest.fn().mockResolvedValue({
			status: 200,
			ok: true,
			text: async () => 'ok',
		}) as never

		const { infra, created } = makeInfra([
			{ id: 'w1', url: 'https://a.example/hook', events: ['candidatura_movida'] },
			{ id: 'w2', url: 'https://b.example/hook', events: ['vaga_publicada'] },
		])

		const count = await createDomainEventDispatcher(infra).dispatch(makeEvent())

		expect(count).toBe(1)
		expect(global.fetch).toHaveBeenCalledTimes(1)
		expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://a.example/hook')
		expect(created[0]).toMatchObject({ webhookId: 'w1', event: 'candidatura_movida', success: true })
	})

	it('webhook sem `events` fica no comportamento legado — não recebe nada novo', async () => {
		global.fetch = jest.fn() as never
		const { infra } = makeInfra([{ id: 'w1', url: 'https://a.example/hook' }])

		expect(await createDomainEventDispatcher(infra).dispatch(makeEvent())).toBe(0)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it('webhook desabilitado não recebe', async () => {
		global.fetch = jest.fn() as never
		const { infra } = makeInfra([
			{ id: 'w1', url: 'https://a.example/hook', events: ['candidatura_movida'], enabled: false },
		])

		expect(await createDomainEventDispatcher(infra).dispatch(makeEvent())).toBe(0)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it('falha de rede vira log de erro e não propaga (o outbox não pode travar)', async () => {
		global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never
		const { infra, created } = makeInfra([
			{ id: 'w1', url: 'https://a.example/hook', events: ['candidatura_movida'] },
		])

		await expect(createDomainEventDispatcher(infra).dispatch(makeEvent())).resolves.toBe(1)
		expect(created[0]).toMatchObject({ success: false, errorMessage: 'ECONNREFUSED' })
	})

	it('lê os webhooks da empresa uma vez por lote', async () => {
		global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, text: async () => '' }) as never
		const { infra } = makeInfra([
			{ id: 'w1', url: 'https://a.example/hook', events: ['candidatura_movida'] },
		])

		const dispatcher = createDomainEventDispatcher(infra)
		await dispatcher.dispatch(makeEvent({ id: 'evt-1' }))
		await dispatcher.dispatch(makeEvent({ id: 'evt-2' }))

		expect(infra.resultWebhookRepository.listByCompany).toHaveBeenCalledTimes(1)
		expect(global.fetch).toHaveBeenCalledTimes(2)
	})
})
