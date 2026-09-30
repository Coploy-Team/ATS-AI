import type { FastifyInstance } from 'fastify'
import { fastifyPlugin } from 'fastify-plugin'
import { env } from '@/env'
import { UnauthorizedError } from '@coploy/shared/errors'

async function apiKeyAuth(app: FastifyInstance) {
	app.addHook('preHandler', async (request: any) => {
		request.validateApiKey = async (): Promise<void> => {
			const apiKey = request.headers['x-api-key']

			if (!apiKey || typeof apiKey !== 'string') {
				throw new UnauthorizedError('API Key não fornecida')
			}

			if (apiKey !== env.CORE_API_KEY) {
				throw new UnauthorizedError('API Key inválida')
			}

			// Não retorna nada, apenas valida
		}
	})
}

export const apiKeyAuthMiddleware = fastifyPlugin(apiKeyAuth)
