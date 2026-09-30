import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { signToken, TOKEN_TTL_SECONDS, type ClientTokenPayload } from '@/lib/oauth/jwt'

function isAllowedRedirectUri(uri: string): boolean {
	let parsed: URL
	try {
		parsed = new URL(uri)
	} catch {
		return false
	}
	if (parsed.protocol === 'https:') return true
	// Loopback pra clients de desenvolvimento (RFC 8252)
	return parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)
}

/**
 * Dynamic Client Registration (RFC 7591) — ChatGPT/Claude se registram sozinhos.
 * client_id é um JWT stateless carregando os redirect_uris aprovados: nenhum
 * storage novo, validação acontece no authorize/token via assinatura.
 */
export function oauthRegister(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().post(
		'/oauth/register',
		{
			config: { rateLimit: rateLimitConfigs.auth },
			// O client_id é um JWT que CARREGA os redirect_uris: lista sem teto
			// viraria token gigante assinado por nós a cada request.
			bodyLimit: 8 * 1024,
			schema: {
				tags: ['oauth'],
				summary: 'OAuth 2.0 Dynamic Client Registration',
				body: z
					.object({
						redirect_uris: z.array(z.string().max(2048)).min(1).max(10),
						client_name: z.string().max(200).optional(),
					})
					.passthrough(),
			},
		},
		async (request, reply) => {
			const { redirect_uris, client_name } = request.body

			if (!redirect_uris.every(isAllowedRedirectUri)) {
				return reply.status(400).send({
					error: 'invalid_redirect_uri',
					error_description: 'redirect_uris must be https (or localhost for development)',
				})
			}

			const clientId = signToken<ClientTokenPayload>(
				{
					kind: 'client',
					clientName: client_name ?? 'MCP Client',
					redirectUris: redirect_uris,
				},
				env.MCP_OAUTH_SIGNING_SECRET,
				TOKEN_TTL_SECONDS.client,
			)

			return reply.status(201).send({
				client_id: clientId,
				client_name: client_name ?? 'MCP Client',
				redirect_uris,
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none',
				client_id_issued_at: Math.floor(Date.now() / 1000),
			})
		},
	)
}
