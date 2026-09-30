import type { FastifyInstance } from 'fastify'

import { env } from '@/env'

/**
 * Metadados de descoberta OAuth (RFC 8414 + RFC 9728).
 *
 * Atrás do LB (PUBLIC_BASE_URL = https://api-hml.coploy.io/mcp-server) os
 * clients montam os well-knowns de dois jeitos:
 *  - path-appended: /mcp-server/.well-known/... → LB rewrita pra raiz do app
 *    (rotas "bare" abaixo);
 *  - path-inserted (RFC): /.well-known/.../mcp-server[/mcp] na RAIZ do
 *    domínio → o url-map roteia esses paths pro backend mcp-server SEM
 *    rewrite, então o app precisa servir os aliases com sufixo.
 * O alias openid-configuration cobre clients que descobrem AS via OIDC.
 */
export function oauthMetadata(app: FastifyInstance) {
	const base = env.PUBLIC_BASE_URL

	const authorizationServerMetadata = {
		issuer: base,
		authorization_endpoint: `${base}/oauth/authorize`,
		token_endpoint: `${base}/oauth/token`,
		registration_endpoint: `${base}/oauth/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		scopes_supported: ['candidate'],
	}

	const protectedResourceMetadata = {
		resource: `${base}/mcp`,
		authorization_servers: [base],
		bearer_methods_supported: ['header'],
		scopes_supported: ['candidate'],
	}

	const AS_PATHS = [
		'/.well-known/oauth-authorization-server',
		'/.well-known/oauth-authorization-server/mcp',
		'/.well-known/oauth-authorization-server/mcp-server',
		'/.well-known/openid-configuration',
		'/.well-known/openid-configuration/mcp',
		'/.well-known/openid-configuration/mcp-server',
	]
	const PRM_PATHS = [
		'/.well-known/oauth-protected-resource',
		'/.well-known/oauth-protected-resource/mcp',
		'/.well-known/oauth-protected-resource/mcp-server',
		'/.well-known/oauth-protected-resource/mcp-server/mcp',
	]

	for (const path of AS_PATHS) {
		app.get(path, async () => authorizationServerMetadata)
	}
	for (const path of PRM_PATHS) {
		app.get(path, async () => protectedResourceMetadata)
	}
}
