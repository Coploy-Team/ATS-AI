import type { InfraProvider } from '../../interfaces'
import { createBetterAuthAdapter, type BetterAuthConfig } from './auth'
import { createDrizzleDb, createPgPool, type PostgresConfig } from './db/client'
import { runMigrations } from './db/migrate'
import { createRabbitPubSubAdapter, type RabbitPubSubConfig } from './pubsub'
import { createRabbitQueueAdapter, type RabbitQueueConfig } from './queue'
import { createDrizzleRepositories } from './repositories'
import { createMinioAdapter, type MinioConfig } from './storage'

export type SelfHostedConfig = {
	postgres: PostgresConfig
	auth: BetterAuthConfig
	storage: MinioConfig
	queue?: RabbitQueueConfig
	pubsub?: RabbitPubSubConfig
}

export async function createSelfHostedProvider(config: SelfHostedConfig): Promise<InfraProvider> {
	const pool = createPgPool(config.postgres)
	const db = createDrizzleDb(pool)

	await runMigrations(db)
	console.info('[SelfHosted] PostgreSQL connected and migrations applied')

	const authAdapter = createBetterAuthAdapter(config.auth)
	const storage = createMinioAdapter(config.storage)

	const queue = config.queue
		? createRabbitQueueAdapter(config.queue)
		: createNoopQueue()

	const pubsub = config.pubsub
		? createRabbitPubSubAdapter(config.pubsub)
		: createNoopPubSub()

	const repositories = createDrizzleRepositories(db)

	return {
		isFirestore: false,
		auth: authAdapter,
		storage,
		queue,
		pubsub,
		...repositories,
	}
}

function createNoopQueue(): InfraProvider['queue'] {
	const notConfigured = () => {
		throw new Error('[Infra] Queue adapter not configured. Provide RabbitMQ config.')
	}

	return {
		ensureQueueExists: notConfigured,
		createTask: notConfigured,
		getQueueInfo: notConfigured,
		getFailedTasks: notConfigured,
	}
}

function createNoopPubSub(): InfraProvider['pubsub'] {
	const notConfigured = () => {
		throw new Error('[Infra] PubSub adapter not configured. Provide RabbitMQ config.')
	}

	return {
		ensureTopicExists: notConfigured,
		publish: notConfigured,
		sendFailedTaskMessage: notConfigured,
	}
}


export { createBetterAuthAdapter } from './auth'
export type { BetterAuthConfig } from './auth'
export type { PostgresConfig } from './db/client'
export { createRabbitPubSubAdapter } from './pubsub'
export type { RabbitPubSubConfig } from './pubsub'
export { connectWithRetry, createRabbitQueueAdapter } from './queue'
export type { RabbitQueueConfig } from './queue'
export { createMinioAdapter } from './storage'
export type { MinioConfig } from './storage'

