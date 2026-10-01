import type { FastifyInstance, FastifyRequest } from 'fastify'
import fastifyPlugin from 'fastify-plugin'

const REQUEST_ID_HEADER = 'x-request-id'

export function genRequestId(request: FastifyRequest): string {
	const incoming = request.headers[REQUEST_ID_HEADER]
	if (typeof incoming === 'string' && incoming.length > 0) {
		return incoming
	}
	return crypto.randomUUID()
}

async function requestIdPlugin(app: FastifyInstance) {
	app.addHook('onSend', async (request, reply) => {
		reply.header('X-Request-Id', request.id)
	})
}

export const requestIdResponse = fastifyPlugin(requestIdPlugin, {
	name: 'request-id-response',
})
