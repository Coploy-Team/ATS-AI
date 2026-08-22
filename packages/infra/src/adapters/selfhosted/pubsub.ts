import amqplib from 'amqplib'
import { randomUUID } from 'node:crypto'

import type { PubSubAdapter } from '../../interfaces/pubsub'
import { connectWithRetry } from './queue'

export type RabbitPubSubConfig = {
	url: string
	defaultTopicName?: string
}

export function createRabbitPubSubAdapter(config: RabbitPubSubConfig): PubSubAdapter {
	const defaultTopic = config.defaultTopicName ?? 'failed-tasks'

	let channel: Awaited<ReturnType<Awaited<ReturnType<typeof amqplib.connect>>['createChannel']>> | null = null
	let connectionPromise: Promise<void> | null = null

	async function getChannel() {
		if (channel) return channel

		if (!connectionPromise) {
			connectionPromise = (async () => {
				const conn = await connectWithRetry(config.url)
				channel = await conn.createChannel()

				conn.on('close', () => {
					channel = null
					connectionPromise = null
					console.warn('[RabbitMQ PubSub] Connection closed, will reconnect on next operation')
				})
			})()
		}

		await connectionPromise
		return channel!
	}

	return {
		async ensureTopicExists(topicName: string): Promise<void> {
			const ch = await getChannel()
			await ch.assertExchange(topicName, 'fanout', { durable: true })
			console.info(`[RabbitMQ PubSub] Exchange ready: ${topicName}`)
		},

		async publish(
			topic: string,
			payload: unknown,
			attributes?: Record<string, string>,
		): Promise<string> {
			const ch = await getChannel()
			const messageId = randomUUID()

			await ch.assertExchange(topic, 'fanout', { durable: true })

			ch.publish(
				topic,
				'',
				Buffer.from(JSON.stringify(payload)),
				{
					persistent: true,
					messageId,
					contentType: 'application/json',
					headers: attributes ?? {},
				},
			)

			console.info(`[RabbitMQ PubSub] Message published to ${topic}: ${messageId}`)
			return messageId
		},

		async sendFailedTaskMessage(
			payload: unknown,
			reason = '',
			service = 'unknown',
			operation = 'unknown',
		): Promise<string> {
			await this.ensureTopicExists(defaultTopic)

			const enrichedPayload = {
				payload,
				failedAt: new Date().toISOString(),
				reason,
				service,
				operation,
			}

			return this.publish(defaultTopic, enrichedPayload, {
				service,
				operation,
				failureTime: new Date().toISOString(),
			})
		},
	}
}
