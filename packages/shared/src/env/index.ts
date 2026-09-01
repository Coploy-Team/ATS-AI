import { z } from 'zod'

/**
 * Infrastructure provider detection.
 * Uses getter functions to read process.env at call time,
 * ensuring dotenv has loaded before evaluation.
 */
export function getInfraProvider(): 'gcp' | 'selfhosted' {
	return (process.env.INFRA_PROVIDER ?? 'gcp') as 'gcp' | 'selfhosted'
}

export function isGcp(): boolean {
	return getInfraProvider() === 'gcp'
}

export function isSelfHosted(): boolean {
	return getInfraProvider() === 'selfhosted'
}

/**
 * @deprecated Use isGcp() function instead.
 */
export const isGcpProvider = new Proxy({} as { valueOf(): boolean }, {
	get(_, prop) {
		const value = isGcp()
		if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => value
		return value
	},
}) as unknown as boolean

/**
 * @deprecated Use isSelfHosted() function instead.
 */
export const isSelfHostedProvider = new Proxy({} as { valueOf(): boolean }, {
	get(_, prop) {
		const value = isSelfHosted()
		if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => value
		return value
	},
}) as unknown as boolean

/**
 * Firebase/GCP environment variable schema.
 * Required only when `INFRA_PROVIDER=gcp` (default).
 */
export const firebaseEnvSchema = {
	FIREBASE_PROJECT_ID: z.string(),
	FIREBASE_CLIENT_EMAIL: z.string(),
	FIREBASE_PRIVATE_KEY: z.string(),
	FIREBASE_DEFAULT_DATABASE_URL: z.string(),
	FIREBASE_STORAGE_BUCKET: z.string(),
}

/**
 * Self-hosted environment variable schema.
 * Required only when `INFRA_PROVIDER=selfhosted`.
 */
export const selfHostedEnvSchema = {
	POSTGRES_URL: z.string(),
	POSTGRES_SCHEMA: z.string().default('public'),
	POSTGRES_SSL: z.string().default('false').transform((v) => v === 'true'),
	SELFHOSTED_BOOTSTRAP_ADMIN_ENABLED: z
		.string()
		.default('true')
		.transform((v) => v === 'true'),
	SELFHOSTED_BOOTSTRAP_ADMIN_EMAIL: z.string().default('admin@coploy.local'),
	SELFHOSTED_BOOTSTRAP_ADMIN_PASSWORD: z.string().default('Admin@123456'),
	SELFHOSTED_BOOTSTRAP_ADMIN_NAME: z.string().default('Coploy Admin'),
	SELFHOSTED_BOOTSTRAP_COMPANY_ID: z.string().default('coploy-enterprise'),
	SELFHOSTED_BOOTSTRAP_COMPANY_NAME: z.string().default('Coploy Enterprise'),
	MINIO_ENDPOINT: z.string().default('minio'),
	MINIO_PORT: z.coerce.number().default(9000),
	MINIO_ACCESS_KEY: z.string(),
	MINIO_SECRET_KEY: z.string(),
	MINIO_BUCKET: z.string().default('coploy'),
	MINIO_USE_SSL: z.string().default('false').transform((v) => v === 'true'),
	/*
	 * URL que o NAVEGADOR usa para buscar o objeto. Sem ela a URL pública sai
	 * como `http://minio:9000/...` — o nome interno da rede Docker, que só os
	 * containers resolvem. O servidor continua falando com o MinIO pelo
	 * MINIO_ENDPOINT; esta é só a base dos links servidos ao cliente.
	 * Ex.: http://localhost:9000/coploy
	 */
	MINIO_PUBLIC_URL: z.string().optional(),
	BETTERAUTH_SECRET: z.string(),
	BETTERAUTH_URL: z.string(),
	/*
	 * Origens extras confiadas pelo BetterAuth (comma-separated). O adapter já
	 * confia no BETTERAUTH_URL e nos localhosts de dev; o front servido em outra
	 * origem (ex.: ATS em http://localhost:8080 na distribuição open) precisa
	 * entrar por aqui, senão o login responde "Invalid origin".
	 */
	AUTH_TRUSTED_ORIGINS: z
		.string()
		.optional()
		.transform((v) =>
			v
				? v
						.split(',')
						.map((o) => o.trim())
						.filter(Boolean)
				: undefined,
		),
	REDIS_URL: z.string().optional(),
	/*
	 * Motor Coploy presente nesta instalação? Default TRUE: os deploys
	 * enterprise (Coolify) sobem o motor no mesmo compose e não devem mudar
	 * nada. A distribuição OPEN  seta false até o plugin ser
	 * instalado — é o que faz o ATS degradar com elegância (telas de
	 * entrevista viram estado vazio + convite, nunca botão morto).
	 */
	MOTOR_ENABLED: z
		.string()
		.default('true')
		.transform((v) => v === 'true'),
}

/**
 * Self-hosted queue environment variables (RabbitMQ).
 * Only needed by apps that use queue/pubsub (orchestrator).
 */
export const selfHostedQueueEnvSchema = {
	RABBITMQ_URL: z.string().default('amqp://guest:guest@rabbitmq:5672'),
}

/**
 * Returns the appropriate infra env schema based on `INFRA_PROVIDER`.
 * Reads process.env at call time (after dotenv loads).
 */
export function infraEnvSchema() {
	return isSelfHosted() ? selfHostedEnvSchema : firebaseEnvSchema
}

/**
 * Validates `process.env` against a Zod schema.
 */
export function createEnv<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
	const parsed = schema.safeParse(process.env)

	if (!parsed.success) {
		console.error('[env] Invalid environment variables:')
		console.error(parsed.error.format())
		throw new Error('Invalid environment variables')
	}

	return parsed.data
}
