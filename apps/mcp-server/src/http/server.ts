import type { IncomingMessage } from 'node:http'
import fastifyCors from '@fastify/cors'
import fastifyFormbody from '@fastify/formbody'
import fastify from 'fastify'
import {
	serializerCompiler,
	validatorCompiler,
} from 'fastify-type-provider-zod'

import { requestIdResponse } from '@coploy/shared/middleware'
import { corsOptions } from '@/config/cors'
import { env } from '@/env'
import { errorHandler } from '@/http/error-handle'
import { rateLimitPlugin } from '@/http/plugins/rate-limit'
import { registerRoutes } from '@/http/routes'
import { getInfra, initializeInfra } from '@/lib/init'

const REQUEST_ID_HEADER = 'x-request-id'

function genReqId(req: IncomingMessage): string {
	const incoming = req.headers[REQUEST_ID_HEADER]
	if (typeof incoming === 'string' && incoming.length > 0) {
		return incoming
	}
	return crypto.randomUUID()
}

async function main() {
	await initializeInfra()

	const app = fastify({ genReqId })

	app.decorate('infra', getInfra())

	app.setValidatorCompiler(validatorCompiler)
	app.setSerializerCompiler(serializerCompiler)

	app.register(requestIdResponse)
	app.register(fastifyCors, corsOptions)
	// Form-urlencoded: página de login do OAuth e token endpoint (RFC 6749)
	app.register(fastifyFormbody)
	// Teto por rota (config.rateLimit) — DCR, token, login do consent e /mcp
	app.register(rateLimitPlugin)

	app.setErrorHandler(errorHandler as Parameters<typeof app.setErrorHandler>[0])

	app.register(registerRoutes)

	await app.listen({ port: env.SERVER_PORT, host: '0.0.0.0' })
	console.info(`[MCP Server] Running on port ${env.SERVER_PORT}`)
	console.info(`[MCP Server] MCP endpoint: http://localhost:${env.SERVER_PORT}/mcp`)
}

main()
