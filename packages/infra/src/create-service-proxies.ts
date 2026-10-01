import type { AuthAdapter } from './interfaces/auth'
import type { StorageAdapter } from './interfaces/storage'
import type { QueueAdapter } from './interfaces/queue'
import type { PubSubAdapter } from './interfaces/pubsub'
import type { InfraProvider } from './interfaces'

/**
 * Creates lazy service proxy objects that delegate to the InfraProvider.
 * This removes boilerplate from app-level init.ts files.
 *
 * Usage:
 * ```ts
 * const { authService, firebaseAdminAuth } = createServiceProxies(getInfra)
 * export { authService, firebaseAdminAuth }
 * ```
 */
export function createServiceProxies(getInfra: () => InfraProvider) {
	const authService: AuthAdapter = {
		verifyToken: (...args) => getInfra().auth.verifyToken(...args),
		createUser: (...args) => getInfra().auth.createUser(...args),
		getUserByEmail: (...args) => getInfra().auth.getUserByEmail(...args),
		getUserByPhone: (...args) => getInfra().auth.getUserByPhone(...args),
		deleteUser: (...args) => getInfra().auth.deleteUser(...args),
		createCustomToken: (...args) => getInfra().auth.createCustomToken(...args),
		signInWithPassword: (...args) => getInfra().auth.signInWithPassword(...args),
	}

	/** @deprecated Use authService instead. */
	const firebaseAdminAuth = {
		verifyIdToken: (...args: Parameters<AuthAdapter['verifyToken']>) => getInfra().auth.verifyToken(...args),
		createUser: (...args: Parameters<AuthAdapter['createUser']>) => getInfra().auth.createUser(...args),
		getUserByEmail: (...args: Parameters<AuthAdapter['getUserByEmail']>) => getInfra().auth.getUserByEmail(...args),
		getUserByPhoneNumber: (...args: Parameters<AuthAdapter['getUserByPhone']>) => getInfra().auth.getUserByPhone(...args),
		deleteUser: (...args: Parameters<AuthAdapter['deleteUser']>) => getInfra().auth.deleteUser(...args),
		createCustomToken: (...args: Parameters<AuthAdapter['createCustomToken']>) => getInfra().auth.createCustomToken(...args),
	}

	const storageService: StorageAdapter = {
		uploadFile: (...args) => getInfra().storage.uploadFile(...args),
		getDownloadUrl: (...args) => getInfra().storage.getDownloadUrl(...args),
		downloadFile: (...args) => getInfra().storage.downloadFile(...args),
		fileExists: (...args) => getInfra().storage.fileExists(...args),
		deleteFile: (...args) => getInfra().storage.deleteFile(...args),
		deleteDirectory: (...args) => getInfra().storage.deleteDirectory(...args),
	}

	const queueService: QueueAdapter = {
		ensureQueueExists: (...args) => getInfra().queue.ensureQueueExists(...args),
		createTask: (...args) => getInfra().queue.createTask(...args),
		getQueueInfo: (...args) => getInfra().queue.getQueueInfo(...args),
		getFailedTasks: (...args) => getInfra().queue.getFailedTasks(...args),
	}

	const pubsubService: PubSubAdapter = {
		ensureTopicExists: (...args) => getInfra().pubsub.ensureTopicExists(...args),
		publish: (...args) => getInfra().pubsub.publish(...args),
		sendFailedTaskMessage: (...args) => getInfra().pubsub.sendFailedTaskMessage(...args),
	}

	return { authService, firebaseAdminAuth, storageService, queueService, pubsubService }
}
