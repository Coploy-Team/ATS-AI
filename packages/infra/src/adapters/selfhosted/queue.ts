import amqplib from 'amqplib'
import { randomUUID } from 'node:crypto'
import type { Channel, ChannelModel } from 'amqplib'

import type { CreateTaskOptions, QueueAdapter } from '../../interfaces/queue'

const RABBITMQ_RETRY_DELAY_MS = 2_000
const RABBITMQ_MAX_RETRIES = 10

export async function connectWithRetry(url: string): Promise<ChannelModel> {
	let lastError: Error | null = null
	for (let attempt = 1; attempt <= RABBITMQ_MAX_RETRIES; attempt++) {
		try {
			return await amqplib.connect(url)
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err))
			if (attempt < RABBITMQ_MAX_RETRIES) {
				const delay = RABBITMQ_RETRY_DELAY_MS * Math.min(attempt, 5)
				console.warn(`[RabbitMQ] Connection attempt ${attempt}/${RABBITMQ_MAX_RETRIES} failed, retrying in ${delay}ms:`, lastError.message)
				await new Promise((r) => setTimeout(r, delay))
			}
		}
	}
	throw lastError ?? new Error('RabbitMQ connection failed')
}

export type RabbitQueueConfig = {
	url: string
	queueName: string
	serviceUrl: string
	deadLetterQueueName?: string
	maxRetries?: number
}

export function createRabbitQueueAdapter(config: RabbitQueueConfig): QueueAdapter {
	const deadLetterQueue = config.deadLetterQueueName ?? `${config.queueName}.deadletter`
	const deadLetterExchange = `${config.queueName}.dlx`

	let channel: Channel | null = null
	let connectionPromise: Promise<void> | null = null

	async function getChannel() {
		if (channel) return channel

		if (!connectionPromise) {
			connectionPromise = (async () => {
				const conn = await connectWithRetry(config.url)
				conn.on('error', (error: unknown) => {
					console.error('[RabbitMQ] Connection error:', error)
				})

				const createdChannel = await conn.createChannel()
				createdChannel.on('error', (error: unknown) => {
					console.error('[RabbitMQ] Channel error:', error)
				})
				channel = createdChannel

				conn.on('close', () => {
					channel = null
					connectionPromise = null
					console.warn('[RabbitMQ] Connection closed, will reconnect on next operation')
				})
			})()
		}

		await connectionPromise
		if (!channel) {
			throw new Error('[RabbitMQ] Channel initialization failed')
		}
		return channel
	}

	return {
		async ensureQueueExists(): Promise<void> {
			const ch = await getChannel()

			await ch.assertExchange(deadLetterExchange, 'direct', { durable: true })

			await ch.assertQueue(deadLetterQueue, { durable: true })
			await ch.bindQueue(deadLetterQueue, deadLetterExchange, config.queueName)

			await ch.assertQueue(config.queueName, {
				durable: true,
				arguments: {
					'x-dead-letter-exchange': deadLetterExchange,
					'x-dead-letter-routing-key': config.queueName,
				},
			})

			console.info(`[RabbitMQ] Queue ready: ${config.queueName} (DLQ: ${deadLetterQueue})`)
		},

		async createTask(
			path: string,
			payload: unknown,
			options?: CreateTaskOptions,
		): Promise<string> {
			const ch = await getChannel()
			const taskId = options?.taskId ?? `task-${randomUUID()}`

			const message = JSON.stringify({
				taskId,
				url: `${config.serviceUrl}${path}`,
				payload,
				createdAt: new Date().toISOString(),
			})

			const publishOptions: Parameters<typeof ch.sendToQueue>[2] = {
				persistent: true,
				messageId: taskId,
				contentType: 'application/json',
				headers: { 'x-target-path': path },
			}

			if (options?.scheduleInSeconds) {
				const delayQueue = `${config.queueName}.delay.${options.scheduleInSeconds}s`

				await ch.assertQueue(delayQueue, {
					durable: true,
					arguments: {
						'x-message-ttl': options.scheduleInSeconds * 1000,
						'x-dead-letter-exchange': '',
						'x-dead-letter-routing-key': config.queueName,
					},
				})

				ch.sendToQueue(delayQueue, Buffer.from(message), publishOptions)
			} else {
				ch.sendToQueue(config.queueName, Buffer.from(message), publishOptions)
			}

			console.info(`[RabbitMQ] Task created: ${taskId}`)
			return taskId
		},

		async getQueueInfo(): Promise<string> {
			try {
				const ch = await getChannel()
				const info = await ch.checkQueue(config.queueName)
				return `Queue: ${config.queueName}, Messages: ${info.messageCount}, Consumers: ${info.consumerCount}`
			} catch (error) {
				return `Error getting queue info: ${error}`
			}
		},

		async getFailedTasks(): Promise<{ count: number; details: string[] }> {
			try {
				const ch = await getChannel()
				const info = await ch.checkQueue(deadLetterQueue)

				const details: string[] = []
				let remaining = info.messageCount

				while (remaining > 0) {
					const msg = await ch.get(deadLetterQueue, { noAck: false })
					if (!msg) break

					const content = msg.content.toString('utf8')
					details.push(`Task: ${msg.properties.messageId}, Payload: ${content}`)

					ch.nack(msg, false, true)
					remaining--

					if (details.length >= 100) break
				}

				return { count: info.messageCount, details }
			} catch (error) {
				return { count: 0, details: [`Error: ${error}`] }
			}
		},
	}
}
