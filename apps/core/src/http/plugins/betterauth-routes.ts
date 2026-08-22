import type { FastifyInstance } from 'fastify'
import { toNodeHandler } from 'better-auth/node'

/**
 * Mounts BetterAuth HTTP routes at /api/auth/*.
 * Only used in selfhosted mode where BetterAuth replaces Firebase Auth.
 *
 * Uses encapsulated Fastify context to prevent body parsing —
 * BetterAuth's Node handler reads the raw request stream directly.
 */
export function registerBetterAuthRoutes(app: FastifyInstance, authInstance: unknown) {
	const handler = toNodeHandler(authInstance as Parameters<typeof toNodeHandler>[0])

	app.register(async (fastify) => {
		fastify.removeAllContentTypeParsers()

		fastify.addContentTypeParser('*', function (_request, _payload, done) {
			done(null)
		})

		fastify.all('/api/auth/*', async (request, reply) => {
			const origin = request.headers.origin
			const res = reply.raw

			if (origin) {
				res.setHeader('Access-Control-Allow-Origin', origin)
				res.setHeader('Access-Control-Allow-Credentials', 'true')
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Api-Key')
				res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Page-Count, Set-Cookie')
			}

			if (request.method === 'OPTIONS') {
				res.statusCode = 204
				res.end()
				return reply.hijack()
			}

			await handler(request.raw, reply.raw)
			reply.hijack()
		})
	})

	console.info('[Core] BetterAuth routes mounted at /api/auth/*')
}
