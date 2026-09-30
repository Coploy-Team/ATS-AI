import type { InfraProvider } from '@coploy/infra'
import { isSelfHosted } from '@coploy/shared/env'

import { env } from '@/env'

const state: { infra: InfraProvider | null } = { infra: null }

export function getInfra(): InfraProvider {
	if (!state.infra) {
		throw new Error('[Init] Infrastructure not initialized. Call initializeInfra() first.')
	}
	return state.infra
}

export async function initializeInfra() {
	if (state.infra) return
	const _env = env as Record<string, unknown>

	if (isSelfHosted()) {
		const { createSelfHostedProvider } = await import('@coploy/infra/selfhosted')
		state.infra = await createSelfHostedProvider({
			postgres: {
				url: _env.POSTGRES_URL as string,
				ssl: _env.POSTGRES_SSL as boolean,
			},
			auth: {
				postgresUrl: _env.POSTGRES_URL as string,
				postgresSsl: _env.POSTGRES_SSL as boolean,
				baseUrl: _env.BETTERAUTH_URL as string,
				secret: _env.BETTERAUTH_SECRET as string,
			},
			storage: {
				endPoint: _env.MINIO_ENDPOINT as string,
				port: _env.MINIO_PORT as number,
				accessKey: _env.MINIO_ACCESS_KEY as string,
				secretKey: _env.MINIO_SECRET_KEY as string,
				bucketName: _env.MINIO_BUCKET as string,
				useSSL: _env.MINIO_USE_SSL as boolean,
			},
		})
	} else {
		// Esta distribuição roda em Postgres. O adapter do Firestore pertence
		// à edição hospedada e não faz parte dela.
		throw new Error('[Init] INFRA_PROVIDER=gcp não é suportado nesta distribuição. Use INFRA_PROVIDER=selfhosted.')
	}
}
