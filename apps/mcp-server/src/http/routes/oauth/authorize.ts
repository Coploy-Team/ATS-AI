import type { FastifyInstance, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import {
	signToken,
	verifyToken,
	TOKEN_TTL_SECONDS,
	type ClientTokenPayload,
	type CodeTokenPayload,
} from '@/lib/oauth/jwt'
import { createCandidateAuthService } from '@/lib/services/candidate-auth-service'
import { renderAuthorizePage } from './authorize-page'

const authorizeQuerySchema = z.object({
	response_type: z.string(),
	client_id: z.string(),
	redirect_uri: z.string(),
	code_challenge: z.string().optional(),
	code_challenge_method: z.string().optional(),
	state: z.string().default(''),
	scope: z.string().default('candidate'),
})

const submitBodySchema = z.object({
	action: z.enum(['login', 'signup']),
	client_id: z.string(),
	redirect_uri: z.string(),
	code_challenge: z.string(),
	state: z.string().default(''),
	scope: z.string().default('candidate'),
	email: z.string().email(),
	password: z.string().min(6),
	name: z.string().optional(),
})

type ValidatedClient = { clientName: string }

/**
 * Valida client_id (JWT DCR) + redirect_uri. Erros aqui NUNCA redirecionam
 * (RFC 6749 §4.1.2.1 — redirect_uri não confiável) — respondem 400 direto.
 */
function validateClient(
	clientId: string,
	redirectUri: string,
	reply: FastifyReply,
): ValidatedClient | null {
	const client = verifyToken<ClientTokenPayload>(clientId, env.MCP_OAUTH_SIGNING_SECRET, 'client')
	if (!client) {
		reply.status(400).send({ error: 'invalid_client', error_description: 'Unknown client_id' })
		return null
	}
	if (!client.redirectUris.includes(redirectUri)) {
		reply.status(400).send({ error: 'invalid_request', error_description: 'redirect_uri not registered' })
		return null
	}
	return { clientName: client.clientName }
}

/**
 * URL absoluta do POST do formulário.
 *
 * Tem que sair de PUBLIC_BASE_URL, não de `request.url`: o LB reescreve o path
 * (`/mcp-server/oauth/authorize` chega no app como `/oauth/authorize`), então
 * qualquer coisa derivada da requisição perde o prefixo — e `/oauth/*` não
 * existe no url-map, cai no backend padrão e responde 404.
 *
 * URL completa, não caminho: assim independe da base do documento, que é o que
 * quebrava o retry quando a página era re-renderizada em cima do POST.
 */
const SUBMIT_URL = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/oauth/authorize/submit`

export function oauthAuthorize(app: FastifyInstance) {
	const candidateAuthService = createCandidateAuthService(app.infra)

	app.withTypeProvider<ZodTypeProvider>().get(
		'/oauth/authorize',
		{
			schema: {
				tags: ['oauth'],
				summary: 'OAuth 2.1 authorization endpoint (login/consent page)',
				querystring: authorizeQuerySchema,
			},
		},
		async (request, reply) => {
			const q = request.query
			const client = validateClient(q.client_id, q.redirect_uri, reply)
			if (!client) return

			if (q.response_type !== 'code') {
				return redirectWithError(reply, q.redirect_uri, q.state, 'unsupported_response_type')
			}
			if (!q.code_challenge || q.code_challenge_method !== 'S256') {
				return redirectWithError(reply, q.redirect_uri, q.state, 'invalid_request', 'PKCE S256 is required')
			}

			return reply.type('text/html').send(
				renderAuthorizePage({
					clientName: client.clientName,
					clientId: q.client_id,
					redirectUri: q.redirect_uri,
					codeChallenge: q.code_challenge,
					state: q.state,
					scope: q.scope,
					submitPath: SUBMIT_URL,
				}),
			)
		},
	)

	app.withTypeProvider<ZodTypeProvider>().post(
		'/oauth/authorize/submit',
		{
			// Aqui entra e-mail + senha de candidato: é a rota de força bruta.
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				tags: ['oauth'],
				summary: 'Handle login/signup form and issue authorization code',
				body: submitBodySchema,
			},
		},
		async (request, reply) => {
			const body = request.body
			const client = validateClient(body.client_id, body.redirect_uri, reply)
			if (!client) return

			const rerenderWithError = (message: string) =>
				reply.type('text/html').send(
					renderAuthorizePage({
						clientName: client.clientName,
						clientId: body.client_id,
						redirectUri: body.redirect_uri,
						codeChallenge: body.code_challenge,
						state: body.state,
						scope: body.scope,
						errorMessage: message,
						submitPath: SUBMIT_URL,
					}),
				)

			let uid: string | null = null
			if (body.action === 'login') {
				uid = await candidateAuthService.loginWithPassword(body.email, body.password)
				if (!uid) return rerenderWithError('E-mail ou senha inválidos.')
			} else {
				if (!body.name || body.name.trim().length < 2) {
					return rerenderWithError('Informe seu nome completo.')
				}
				if (await candidateAuthService.emailExists(body.email)) {
					return rerenderWithError('Este e-mail já tem conta — use a aba Entrar.')
				}
				try {
					uid = await candidateAuthService.registerCandidate({
						name: body.name.trim(),
						email: body.email,
						password: body.password,
					})
				} catch (err) {
					console.error('[OAuth] registerCandidate failed:', err)
					const message = err instanceof Error ? err.message : String(err)
					// Política de senha do Firebase (ex.: exige maiúscula) — devolver motivo acionável
					if (message.includes('PASSWORD_DOES_NOT_MEET_REQUIREMENTS') || message.includes('password requirements')) {
						return rerenderWithError('Senha fraca: use ao menos 6 caracteres com letra maiúscula, minúscula e número.')
					}
					if (message.includes('email-already-exists') || message.includes('EMAIL_EXISTS')) {
						return rerenderWithError('Este e-mail já tem conta — use a aba Entrar.')
					}
					return rerenderWithError('Não foi possível criar a conta. Tente novamente.')
				}
			}

			const code = signToken<CodeTokenPayload>(
				{
					kind: 'code',
					uid,
					clientId: body.client_id,
					redirectUri: body.redirect_uri,
					codeChallenge: body.code_challenge,
					scope: body.scope,
				},
				env.MCP_OAUTH_SIGNING_SECRET,
				TOKEN_TTL_SECONDS.code,
			)

			const target = new URL(body.redirect_uri)
			target.searchParams.set('code', code)
			if (body.state) target.searchParams.set('state', body.state)
			return reply.redirect(target.toString(), 302)
		},
	)
}

function redirectWithError(
	reply: FastifyReply,
	redirectUri: string,
	state: string,
	error: string,
	description?: string,
) {
	const target = new URL(redirectUri)
	target.searchParams.set('error', error)
	if (description) target.searchParams.set('error_description', description)
	if (state) target.searchParams.set('state', state)
	return reply.redirect(target.toString(), 302)
}
