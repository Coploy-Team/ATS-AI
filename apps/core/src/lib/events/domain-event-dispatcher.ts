import type { DomainEvent } from '@coploy/domain'
import type { InfraProvider } from '@coploy/infra'

/**
 * Entrega de domain events nos webhooks do cliente (V2-504).
 *
 * O outbox já emitia 11 tipos de evento — só que para o PubSub interno. Quem
 * quer manter o próprio funil sincronizado recebia apenas `interview.finished`,
 * o webhook de resultado. Aqui o mesmo evento que vai pro barramento também vai
 * pro endpoint de quem **assinou aquele tipo**.
 *
 * Duas garantias que moldam o código:
 *
 * 1. **Assinar é opt-in.** Webhook sem `events` continua recebendo só o de
 *    resultado. Um endpoint em produção não pode começar a receber tráfego novo
 *    porque nós adicionamos um tipo ao catálogo.
 * 2. **Entrega não derruba o outbox.** Falha de rede no cliente não pode marcar
 *    o evento como `failed` e travar o drain — o PubSub já recebeu. Por isso
 *    tudo aqui é best-effort e vira `WebhookDeliveryLog`, que é onde o cliente
 *    enxerga o erro e pede retry.
 */

const DELIVERY_TIMEOUT_MS = 10_000

export function createDomainEventDispatcher(infra: InfraProvider) {
	/*
	 * Cache por drain: um lote de 50 eventos costuma ser de poucas empresas, e
	 * sem isso seriam 50 leituras de webhook para as mesmas 2 ou 3.
	 */
	const byCompany = new Map<string, Awaited<ReturnType<typeof loadWebhooks>>>()

	async function loadWebhooks(companyId: string) {
		try {
			const all = await infra.resultWebhookRepository.listByCompany(companyId)
			return all.filter((webhook) => webhook.enabled !== false)
		} catch {
			// leitura falhou: não entrega ninguém, mas também não quebra o drain
			return []
		}
	}

	async function subscribersOf(event: DomainEvent) {
		if (!event.companyId) return []
		let webhooks = byCompany.get(event.companyId)
		if (!webhooks) {
			webhooks = await loadWebhooks(event.companyId)
			byCompany.set(event.companyId, webhooks)
		}
		return webhooks.filter((webhook) => (webhook.events ?? []).includes(event.type))
	}

	async function deliverOne(
		webhook: { id: string; url?: string | null; method?: string | null; headers?: unknown },
		event: DomainEvent,
	) {
		const url = webhook.url
		if (!url) return

		const method = webhook.method ?? 'POST'
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-Coploy-Event': event.type,
			'X-Coploy-Event-Id': event.id,
			'X-Coploy-Schema-Version': String(event.schemaVersion),
			...((webhook.headers as Record<string, string> | null | undefined) ?? {}),
		}

		const body = {
			event: event.type,
			eventId: event.id,
			schemaVersion: event.schemaVersion,
			occurredAt: event.createdAt,
			companyId: event.companyId,
			data: event.payload,
		}

		const started = Date.now()
		let statusCode: number | null = null
		let responseBody: string | null = null
		let success = false
		let errorMessage: string | null = null

		try {
			const response = await fetch(url, {
				method,
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
			})
			statusCode = response.status
			responseBody = (await response.text().catch(() => '')).slice(0, 2000)
			success = response.ok
			if (!success) errorMessage = `HTTP ${response.status}`
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : String(err)
		}

		try {
			await infra.webhookDeliveryLogRepository.create({
				webhookId: webhook.id,
				companyId: event.companyId ?? '',
				event: event.type,
				url,
				method,
				requestHeaders: headers,
				requestBody: body,
				statusCode,
				responseBody,
				success,
				errorMessage,
				durationMs: Date.now() - started,
				createdAt: new Date().toISOString(),
			})
		} catch {
			// log é observabilidade; perder o log não pode derrubar o drain
		}
	}

	return {
		/** Entrega o evento a quem assinou. Nunca lança. */
		async dispatch(event: DomainEvent): Promise<number> {
			try {
				const targets = await subscribersOf(event)
				if (targets.length === 0) return 0
				await Promise.allSettled(targets.map((webhook) => deliverOne(webhook, event)))
				return targets.length
			} catch {
				return 0
			}
		},
	}
}
