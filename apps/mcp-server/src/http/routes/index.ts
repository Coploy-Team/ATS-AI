import type { FastifyInstance } from 'fastify'

import { healthCheck } from './health/health-check'
import { mcpRoute } from './mcp/mcp-route'
import { otsBinding } from './ots/binding'
import { oauthAuthorize } from './oauth/authorize'
import { oauthMetadata } from './oauth/metadata'
import { oauthRegister } from './oauth/register'
import { oauthToken } from './oauth/token'

export function registerRoutes(app: FastifyInstance): void {
	app.register(healthCheck)
	app.register(mcpRoute)
	app.register(otsBinding)
	app.register(oauthMetadata)
	app.register(oauthRegister)
	app.register(oauthAuthorize)
	app.register(oauthToken)
}
