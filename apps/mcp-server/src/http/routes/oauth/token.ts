import type { FastifyInstance, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import {
	signToken,
	verifyToken,
	verifyPkceS256,
	TOKEN_TTL_SECONDS,
	type AccessTokenPayload,
	type CodeTokenPayload,
	type RefreshTokenPayload,
} from '@/lib/oauth/jwt'

const tokenBodySchema = z
	.object({
		grant_type: z.string(),
		code: z.string().optional(),
		code_verifier: z.string().optional(),
		redirect_uri: z.string().optional(),
		client_id: z.string().optional(),
		refresh_token: z.string().optional(),
	})
	.passthrough()

function tokenError(reply: FastifyReply, error: string, description?: string) {
	return reply
		.status(400)
		.header('Cache-Control', 'no-store')
		.send({ error, ...(description ? { error_description: description } : {}) })
}

function issueTokens(uid: string, scope: string, clientId: string) {
	const secret = env.MCP_OAUTH_SIGNING_SECRET
	return {
		access_token: signToken<AccessTokenPayload>(
			{ kind: 'access', uid, scope },
			secret,
			TOKEN_TTL_SECONDS.access,
		),
		token_type: 'Bearer',
		expires_in: TOKEN_TTL_SECONDS.access,
		refresh_token: signToken<RefreshTokenPayload>(
			{ kind: 'refresh', uid, scope, clientId },
			secret,
			TOKEN_TTL_SECONDS.refresh,
		),
		scope,
	}
}

export function oauthToken(app: FastifyInstance) {
	app.withTypeProvider<ZodTypeProvider>().post(
		'/oauth/token',
		{
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				tags: ['oauth'],
				summary: 'OAuth 2.1 token endpoint (authorization_code + refresh_token)',
				body: tokenBodySchema,
			},
		},
		async (request, reply) => {
			const body = request.body
			const secret = env.MCP_OAUTH_SIGNING_SECRET

			if (body.grant_type === 'authorization_code') {
				if (!body.code || !body.code_verifier) {
					return tokenError(reply, 'invalid_request', 'code and code_verifier are required')
				}
				const code = verifyToken<CodeTokenPayload>(body.code, secret, 'code')
				if (!code) {
					return tokenError(reply, 'invalid_grant', 'Authorization code is invalid or expired')
				}
				if (body.client_id && body.client_id !== code.clientId) {
					return tokenError(reply, 'invalid_grant', 'client_id mismatch')
				}
				if (body.redirect_uri && body.redirect_uri !== code.redirectUri) {
					return tokenError(reply, 'invalid_grant', 'redirect_uri mismatch')
				}
				if (!verifyPkceS256(body.code_verifier, code.codeChallenge)) {
					return tokenError(reply, 'invalid_grant', 'PKCE verification failed')
				}
				return reply
					.header('Cache-Control', 'no-store')
					.send(issueTokens(code.uid, code.scope, code.clientId))
			}

			if (body.grant_type === 'refresh_token') {
				if (!body.refresh_token) {
					return tokenError(reply, 'invalid_request', 'refresh_token is required')
				}
				const refresh = verifyToken<RefreshTokenPayload>(body.refresh_token, secret, 'refresh')
				if (!refresh) {
					return tokenError(reply, 'invalid_grant', 'Refresh token is invalid or expired')
				}
				return reply
					.header('Cache-Control', 'no-store')
					.send(issueTokens(refresh.uid, refresh.scope, refresh.clientId))
			}

			return tokenError(reply, 'unsupported_grant_type')
		},
	)
}
