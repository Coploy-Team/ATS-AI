import type { FastifyCorsOptions } from '@fastify/cors'

export const corsOptions: FastifyCorsOptions = {
	origin: true,
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version'],
	exposedHeaders: ['Mcp-Session-Id'],
}
