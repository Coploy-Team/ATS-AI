import type { InfraProvider } from '@coploy/infra'

declare module 'fastify' {
	interface FastifyInstance {
		infra: InfraProvider
	}
}
