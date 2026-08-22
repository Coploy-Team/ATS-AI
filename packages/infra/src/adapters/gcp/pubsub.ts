import { PubSub } from '@google-cloud/pubsub'

import type { PubSubAdapter } from '../../interfaces/pubsub'

export type GcpPubSubConfig = {
	projectId: string
	defaultTopicName?: string
}

export function createGcpPubSubAdapter(config: GcpPubSubConfig): PubSubAdapter {
	const client = new PubSub({ projectId: config.projectId })
	const defaultTopic = config.defaultTopicName ?? 'failed-tasks'

	return {
		async ensureTopicExists(topicName: string): Promise<void> {
			const topic = client.topic(topicName)
			const [exists] = await topic.exists()

			if (!exists) {
				await client.createTopic(topicName)
				console.info(`[PubSub] Topic created: ${topicName}`)
			}
		},

		async publish(
			targetTopic: string,
			payload: unknown,
			attributes?: Record<string, string>,
		): Promise<string> {
			const topic = client.topic(targetTopic)
			const messageId = await topic.publishMessage({
				json: payload,
				attributes,
			})

			console.info(`[PubSub] Message published to ${targetTopic}: ${messageId}`)
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
