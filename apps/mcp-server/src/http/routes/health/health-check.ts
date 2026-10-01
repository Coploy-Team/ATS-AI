import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

export function healthCheck(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().get(
		'/health',
		{
			schema: {
				tags: ['health'],
				summary: 'Health check',
				response: {
					200: z.object({
						status: z.string(),
						service: z.string(),
						timestamp: z.string(),
					}),
				},
			},
		},
		async () => ({
			status: 'ok',
			service: 'mcp-server',
			timestamp: new Date().toISOString(),
		}),
	)
}
