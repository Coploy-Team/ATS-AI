import { CloudTasksClient, protos } from '@google-cloud/tasks'
import { randomUUID } from 'node:crypto'

import type { CreateTaskOptions, QueueAdapter } from '../../interfaces/queue'

export type GcpQueueConfig = {
	projectId: string
	location: string
	queueName: string
	serviceUrl: string
	deadLetterQueueName?: string
	maxRetries?: number
}

export function createCloudTasksAdapter(config: GcpQueueConfig): QueueAdapter {
	const client = new CloudTasksClient()
	const maxRetries = config.maxRetries ?? 5
	const deadLetterQueue = config.deadLetterQueueName ?? `${config.queueName}-deadletter`

	const queuePath = client.queuePath(config.projectId, config.location, config.queueName)
	const deadLetterPath = client.queuePath(config.projectId, config.location, deadLetterQueue)
	const locationPath = client.locationPath(config.projectId, config.location)

	async function ensureQueue(
		name: string,
		retryConfig?: protos.google.cloud.tasks.v2.IRetryConfig,
	): Promise<void> {
		const path = client.queuePath(config.projectId, config.location, name)
		try {
			await client.getQueue({ name: path })
		} catch {
			await client.createQueue({
				parent: locationPath,
				queue: { name: path, retryConfig },
			})
			console.info(`[CloudTasks] Queue created: ${name}`)
		}
	}

	return {
		async ensureQueueExists(): Promise<void> {
			await ensureQueue(deadLetterQueue)

			await ensureQueue(config.queueName, {
				maxAttempts: maxRetries,
				maxRetryDuration: { seconds: 300 },
				minBackoff: { seconds: 10 },
				maxBackoff: { seconds: 300 },
				maxDoublings: 5,
			})

			try {
				await client.updateQueue({
					queue: {
						name: queuePath,
						retryConfig: {
							maxAttempts: maxRetries,
							maxRetryDuration: { seconds: 300 },
							minBackoff: { seconds: 10 },
							maxBackoff: { seconds: 300 },
							maxDoublings: 5,
						},
					},
				})
			} catch (error) {
				console.warn('[CloudTasks] Queue update warning:', error)
			}
		},

		async createTask(
			path: string,
			payload: unknown,
			options?: CreateTaskOptions,
		): Promise<string> {
			const body = Buffer.from(JSON.stringify(payload)).toString('base64')
			const taskId = options?.taskId ?? `task-${randomUUID()}`
			const taskName = client.taskPath(config.projectId, config.location, config.queueName, taskId)

			const scheduleTime = options?.scheduleInSeconds
				? { seconds: Math.floor(Date.now() / 1000) + options.scheduleInSeconds }
				: undefined

			const [response] = await client.createTask({
				parent: queuePath,
				task: {
					name: taskName,
					httpRequest: {
						httpMethod: 'POST',
						url: `${config.serviceUrl}${path}`,
						headers: { 'Content-Type': 'application/json' },
						body,
					},
					scheduleTime,
				},
			})

			console.info(`[CloudTasks] Task created: ${taskId}`)
			return response.name ?? taskId
		},

		async getQueueInfo(): Promise<string> {
			try {
				const [queue] = await client.getQueue({ name: queuePath })
				return `Queue: ${config.queueName}, State: ${queue.state}, Name: ${queue.name}`
			} catch (error) {
				return `Error getting queue info: ${error}`
			}
		},

		async getFailedTasks(): Promise<{ count: number; details: string[] }> {
			try {
				const [tasks] = await client.listTasks({ parent: deadLetterPath })

				const details = tasks.map((task) => {
					const taskPayload = task.httpRequest?.body
						? Buffer.from(task.httpRequest.body as string, 'base64').toString('utf8')
						: 'No payload'

					return `Task: ${task.name}, Created: ${task.createTime?.seconds}, Payload: ${taskPayload}`
				})

				return { count: tasks.length, details }
			} catch (error) {
				return { count: 0, details: [`Error: ${error}`] }
			}
		},
	}
}
