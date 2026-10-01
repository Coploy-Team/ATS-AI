import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { verifyToken, type AccessTokenPayload } from '@/lib/oauth/jwt'
import { createCandidateInterviewsService } from '@/lib/services/candidate-interviews-service'
import { createCandidateProfileService } from '@/lib/services/candidate-profile-service'
import { createCandidateNetworkService } from '@/lib/services/candidate-network-service'
import { createCandidateAuthService } from '@/lib/services/candidate-auth-service'
import { createPublicJobsService } from '@/lib/services/public-jobs-service'
import { createMcpServer } from '@/mcp/create-mcp-server'

const METHOD_NOT_ALLOWED = {
	jsonrpc: '2.0',
	error: {
		code: -32000,
		message: 'Method not allowed. This MCP server is stateless — use POST /mcp.',
	},
	id: null,
} as const

function extractAuthenticatedUid(request: FastifyRequest): string | undefined {
	const header = request.headers.authorization
	if (!header?.startsWith('Bearer ')) return undefined
	const claims = verifyToken<AccessTokenPayload>(
		header.slice('Bearer '.length),
		env.MCP_OAUTH_SIGNING_SECRET,
		'access',
	)
	return claims?.uid
}

/**
 * Endpoint MCP (Streamable HTTP, stateless). Cada POST cria um par
 * McpServer+transport descartável — exigência do SDK (1 transport por server).
 *
 * Auth: Bearer opcional → tools de conta. Com MCP_REQUIRE_AUTH=true, request
 * sem token válido leva 401 + WWW-Authenticate com resource_metadata (RFC
 * 9728) — é isso que dispara a descoberta OAuth em ChatGPT/Claude.
 */
export function mcpRoute(app: FastifyInstance) {
	/**
	 * Clientes MCP sondam o endpoint com POST vazio e `content-type:
	 * application/octet-stream`. O Fastify rejeitava com
	 * FST_ERR_CTP_INVALID_MEDIA_TYPE, que subia como **500** no log e dava ao
	 * cliente a impressão de servidor quebrado — quando a resposta certa é um
	 * erro JSON-RPC.
	 *
	 * Corpo vazio vira `undefined` e segue pro transporte, que responde no
	 * protocolo. Corpo com conteúdo tenta JSON, porque é o que um cliente
	 * confuso costuma mandar.
	 */
	app.addContentTypeParser(
		'application/octet-stream',
		{ parseAs: 'string' },
		(_request, body: string, done) => {
			if (!body || body.trim() === '') return done(null, undefined)
			try {
				done(null, JSON.parse(body))
			} catch {
				done(null, undefined)
			}
		},
	)

	const publicJobsService = createPublicJobsService(app.infra)
	const candidateAuthService = createCandidateAuthService(app.infra)
	const interviewsService = createCandidateInterviewsService(app.infra)
	const profileService = createCandidateProfileService(app.infra)
	const networkService = createCandidateNetworkService(app.infra)

	app.post('/mcp', { config: { rateLimit: rateLimitConfigs.mcp } }, async (request, reply) => {
		const authenticatedUid = extractAuthenticatedUid(request)

		if (env.MCP_REQUIRE_AUTH && !authenticatedUid) {
			return reply
				.status(401)
				.header(
					'WWW-Authenticate',
					`Bearer resource_metadata="${env.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
				)
				.send({
					jsonrpc: '2.0',
					error: { code: -32001, message: 'Authentication required' },
					id: null,
				})
		}

		const server = createMcpServer({
			publicJobsService,
			candidateAuthService,
			interviewsService,
			profileService,
			networkService,
			authenticatedUid,
		})
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		})

		reply.hijack()
		reply.raw.on('close', () => {
			void transport.close()
			void server.close()
		})

		await server.connect(transport)
		await transport.handleRequest(request.raw, reply.raw, request.body)
	})

	app.get('/mcp', async (_request, reply) => {
		return reply.status(405).send(METHOD_NOT_ALLOWED)
	})

	app.delete('/mcp', async (_request, reply) => {
		return reply.status(405).send(METHOD_NOT_ALLOWED)
	})
}
