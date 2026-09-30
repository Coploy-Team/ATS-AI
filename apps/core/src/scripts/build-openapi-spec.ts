/**
 * Boots Fastify with swagger + all routes (without listening) and returns the
 * full OpenAPI spec object. Shared by generate-openapi.ts (full internal spec)
 * and generate-public-openapi.ts (public contract artifact) so the two can
 * never drift from each other.
 *
 * A mock InfraProvider is used so no real DB connection is required.
 * Route handlers are never executed — only route schemas are registered.
 */
import fastifySwagger from '@fastify/swagger'
import { fastify } from 'fastify'
import {
	jsonSchemaTransform,
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import type { InfraProvider } from '@coploy/infra'
import { registerRoutes } from '@/http/routes'

/**
 * Creates a deep-mock InfraProvider using Proxy.
 * Every property access returns another Proxy, every call returns a resolved Promise.
 * This is safe for schema registration — handlers are never invoked during spec generation.
 */
function createMockInfra(): InfraProvider {
	const handler: ProxyHandler<object> = {
		get(_target, prop) {
			// Prevent Promise-detection from treating this as a thenable
			if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined
			if (prop === Symbol.toPrimitive || prop === Symbol.toStringTag) return undefined
			return new Proxy(() => Promise.resolve(null), handler)
		},
		apply(_target, _thisArg, _args) {
			return Promise.resolve(null)
		},
		construct(_target, _args) {
			return new Proxy({}, handler)
		},
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new Proxy({} as any, handler) as InfraProvider
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildOpenApiSpec(): Promise<Record<string, any>> {
	const app = fastify({
		logger: false,
	}).withTypeProvider<ZodTypeProvider>()

	app.setSerializerCompiler(serializerCompiler)
	app.setValidatorCompiler(validatorCompiler)

	// Decorate with mock infra so route registration can call createXxxService(app.infra)
	// without requiring a live DB connection.
	app.decorate('infra', createMockInfra())

	app.register(fastifySwagger, {
		openapi: {
			info: {
				title: 'coploy api recruiter',
				description: 'api for coploy recruiter',
				version: '1.0.0',
			},
			components: {
				securitySchemes: {
					bearerAuth: {
						type: 'http',
						scheme: 'bearer',
						bearerFormat: 'JWT',
					},
				},
			},
		},
		transform: jsonSchemaTransform,
	})

	app.register(registerRoutes)

	await app.ready()

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const spec = app.swagger() as Record<string, any>
	await app.close()
	return spec
}
