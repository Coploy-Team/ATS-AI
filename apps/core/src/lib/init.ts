import type { InfraProvider, StorageAdapter } from '@coploy/infra'
import { createServiceProxies } from '@coploy/infra'
import { isSelfHosted } from '@coploy/shared/env'

import { env } from '@/env'
import { ensureSelfHostedAdminSeed } from '@/lib/selfhosted-bootstrap'

type ExtendedInfra = InfraProvider & { raw?: { app: unknown; db: unknown }; authInstance?: unknown }

const state: { infra: ExtendedInfra | null } = { infra: null }

export function getInfra(): ExtendedInfra {
	if (!state.infra) {
		throw new Error('[Init] Infrastructure not initialized. Call initializeInfra() first.')
	}
	return state.infra
}

export async function initializeInfra(): Promise<ExtendedInfra> {
	if (state.infra) return state.infra
	const _env = env as any
	if (isSelfHosted()) {
		const { createSelfHostedProvider } = await import('@coploy/infra/selfhosted')
		const infra = await createSelfHostedProvider({
			postgres: {
				url: _env.POSTGRES_URL,
				ssl: _env.POSTGRES_SSL as boolean,
			},
			auth: {
				postgresUrl: _env.POSTGRES_URL,
				postgresSsl: _env.POSTGRES_SSL as boolean,
				baseUrl: _env.BETTERAUTH_URL,
				secret: _env.BETTERAUTH_SECRET,
				trustedOrigins: _env.AUTH_TRUSTED_ORIGINS,
			},
			storage: {
				endPoint: _env.MINIO_ENDPOINT,
				port: _env.MINIO_PORT,
				accessKey: _env.MINIO_ACCESS_KEY,
				secretKey: _env.MINIO_SECRET_KEY,
				bucketName: _env.MINIO_BUCKET,
				useSSL: _env.MINIO_USE_SSL as boolean,
				publicUrl: _env.MINIO_PUBLIC_URL,
			},
			pubsub: {
				url: _env.RABBITMQ_URL,
				defaultTopicName: _env.OUTBOX_PUBLISHER_TOPIC,
			},
		})

		state.infra = {
			...infra,
			authInstance: (infra.auth as { authInstance?: unknown }).authInstance,
		}

		await ensureSelfHostedAdminSeed(infra, {
			enabled: _env.SELFHOSTED_BOOTSTRAP_ADMIN_ENABLED,
			adminEmail: _env.SELFHOSTED_BOOTSTRAP_ADMIN_EMAIL,
			adminPassword: _env.SELFHOSTED_BOOTSTRAP_ADMIN_PASSWORD,
			adminName: _env.SELFHOSTED_BOOTSTRAP_ADMIN_NAME,
			companyId: _env.SELFHOSTED_BOOTSTRAP_COMPANY_ID,
			companyName: _env.SELFHOSTED_BOOTSTRAP_COMPANY_NAME,
		})
	} else {
		const { createGcpProvider } = await import('@coploy/infra/gcp')

		const infra = createGcpProvider({
			firebase: {
				projectId: _env.FIREBASE_PROJECT_ID,
				clientEmail: _env.FIREBASE_CLIENT_EMAIL,
				privateKey: _env.FIREBASE_PRIVATE_KEY,
				databaseURL: _env.FIREBASE_DEFAULT_DATABASE_URL,
				storageBucket: _env.FIREBASE_STORAGE_BUCKET,
				apiKey: _env.FIREBASE_API_KEY,
			},
			pubsub: {
				projectId: _env.FIREBASE_PROJECT_ID,
				defaultTopicName: _env.OUTBOX_PUBLISHER_TOPIC,
			},
		})

		state.infra = { ...infra, raw: infra.raw }
	}

	return getInfra()
}

export const { authService, firebaseAdminAuth } = createServiceProxies(getInfra)

// Core-specific: storageService with getPresignedUploadUrl support
export const storageService: StorageAdapter = {
	uploadFile: (...args) => getInfra().storage.uploadFile(...args),
	getDownloadUrl: (...args) => getInfra().storage.getDownloadUrl(...args),
	downloadFile: (...args) => getInfra().storage.downloadFile(...args),
	fileExists: (...args) => getInfra().storage.fileExists(...args),
	deleteFile: (...args) => getInfra().storage.deleteFile(...args),
	deleteDirectory: (...args) => getInfra().storage.deleteDirectory(...args),
	getPresignedUploadUrl: (...args) => {
		const fn = getInfra().storage.getPresignedUploadUrl
		if (!fn) throw new Error('Presigned uploads not supported in this provider')
		return fn(...args)
	},
}

export async function uploadImage(
	file: Buffer,
	path: string,
	filename: string,
	contentType: string,
): Promise<string> {
	return getInfra().storage.uploadFile(file, path, filename, contentType)
}

/**
 * Returns the BetterAuth instance for HTTP handler mounting.
 * Only available in selfhosted mode.
 */
export function getBetterAuthInstance() {
	const instance = getInfra().authInstance
	if (!instance) {
		throw new Error('[Init] BetterAuth instance is only available in selfhosted mode.')
	}
	return instance
}
