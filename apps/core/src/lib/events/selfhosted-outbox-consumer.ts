import type { InfraProvider } from '@coploy/infra'
import { env } from '@/env'
import { createOutboxPublisher } from './outbox-publisher'

let started = false

export function startSelfHostedOutboxConsumer(infra: InfraProvider): void {
	if (started) return
	started = true

	const publisher = createOutboxPublisher(infra)

	const drain = async () => {
		try {
			const result = await publisher.pollAndPublish({
				topic: env.OUTBOX_PUBLISHER_TOPIC,
				limit: env.OUTBOX_PUBLISHER_BATCH_LIMIT,
				ensureTopic: true,
			})
			console.info('[outbox-publisher] drain complete', {
				trigger: 'selfhosted-loop',
				polled: result.polled,
				published: result.published,
				failed: result.failed,
			})
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			console.error('[outbox-publisher] selfhosted drain failed', { message })
		}
	}

	void drain()
	setInterval(() => {
		void drain()
	}, env.OUTBOX_PUBLISHER_INTERVAL_MS)
}
