export {
	BadRequestError,
	NotFoundError,
	StripeError,
	UnauthorizedError,
} from './errors'

export { createAuthMiddleware, errorHandler } from './middleware'
export type { AuthDependencies } from './middleware'

export { secureLogger, getDiceBearAvatarUrl } from './utils'
export type { SecureLogger } from './utils'

export type { AuthenticatedRequest } from './types'

export {
	createEnv,
	firebaseEnvSchema,
	selfHostedEnvSchema,
	selfHostedQueueEnvSchema,
	infraEnvSchema,
	getInfraProvider,
	isGcp,
	isSelfHosted,
	isGcpProvider,
	isSelfHostedProvider,
} from './env'

export * from './contracts'

export { encrypt, decrypt, isEncrypted } from './crypto'
