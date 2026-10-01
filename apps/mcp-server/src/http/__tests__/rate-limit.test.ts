/**
 * Teto de taxa nas rotas públicas do OAuth e no /mcp (F1.3 do Plano F).
 *
 * As faixas de produção são as do core (10 por 15 min nas rotas de auth), e
 * o shape do 429 é o mesmo — por isso o env é mockado como produção: em
 * homolog/testing a faixa é folgada de propósito e o teste não provaria nada.
 */
jest.mock('@/env', () => ({
	env: {
		NODE_ENV: 'production',
		MCP_OAUTH_SIGNING_SECRET: 'test-secret-with-enough-entropy-000000',
		PUBLIC_BASE_URL: 'https://api.test/mcp-server',
	},
}))

import fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { mcpRateLimitKey, rateLimitConfigs, rateLimitPlugin } from '../plugins/rate-limit'
import { oauthRegister } from '../routes/oauth/register'
import { oauthToken } from '../routes/oauth/token'
import { signToken } from '@/lib/oauth/jwt'

async function buildApp(): Promise<FastifyInstance> {
	const app = fastify()
	app.setValidatorCompiler(validatorCompiler)
	app.setSerializerCompiler(serializerCompiler)
	await app.register(rateLimitPlugin)
	app.register(oauthRegister)
	app.register(oauthToken)
	await app.ready()
	return app
}

const registerBody = { redirect_uris: ['https://chatgpt.com/cb'], client_name: 'ChatGPT' }

describe('rate limit do MCP', () => {
	let app: FastifyInstance

	beforeEach(async () => {
		app = await buildApp()
	})

	afterEach(async () => {
		await app.close()
	})

	it('a 11ª tentativa de registro em 15 min responde 429 no shape do core', async () => {
		const max = rateLimitConfigs.auth.max as number
		expect(max).toBe(10)

		for (let i = 0; i < max; i++) {
			const res = await app.inject({ method: 'POST', url: '/oauth/register', payload: registerBody })
			expect(res.statusCode).toBe(201)
		}

		const blocked = await app.inject({ method: 'POST', url: '/oauth/register', payload: registerBody })
		expect(blocked.statusCode).toBe(429)
		expect(blocked.json()).toMatchObject({
			error: 'Authentication rate limit exceeded',
			statusCode: 429,
			remainingTime: expect.any(Number),
		})
	})

	it('o token endpoint divide a mesma faixa de auth, por IP', async () => {
		const max = rateLimitConfigs.auth.max as number
		for (let i = 0; i < max; i++) {
			const res = await app.inject({
				method: 'POST',
				url: '/oauth/token',
				payload: { grant_type: 'refresh_token', refresh_token: 'nope' },
			})
			// grant inválido é 400 — o teto conta a tentativa mesmo assim
			expect(res.statusCode).toBe(400)
		}
		const blocked = await app.inject({
			method: 'POST',
			url: '/oauth/token',
			payload: { grant_type: 'refresh_token', refresh_token: 'nope' },
		})
		expect(blocked.statusCode).toBe(429)
	})

	it('IPs diferentes não dividem o balde', async () => {
		const max = rateLimitConfigs.auth.max as number
		for (let i = 0; i < max; i++) {
			await app.inject({ method: 'POST', url: '/oauth/register', payload: registerBody, remoteAddress: '10.0.0.1' })
		}
		const other = await app.inject({
			method: 'POST',
			url: '/oauth/register',
			payload: registerBody,
			remoteAddress: '10.0.0.2',
		})
		expect(other.statusCode).toBe(201)
	})

	it('registro recusa lista de redirect_uris sem teto (o client_id carrega a lista)', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/oauth/register',
			payload: { redirect_uris: Array.from({ length: 11 }, (_, i) => `https://x.test/${i}`) },
		})
		expect(res.statusCode).toBe(400)
	})

	describe('chave do /mcp', () => {
		const request = (authorization?: string) =>
			({ ip: '10.0.0.1', headers: { 'user-agent': 'ua', authorization } }) as never

		it('autenticado conta pela conta, não pelo IP', () => {
			const token = signToken(
				{ kind: 'access', uid: 'u1', scope: 'candidate' },
				'test-secret-with-enough-entropy-000000',
				60,
			)
			expect(mcpRateLimitKey(request(`Bearer ${token}`))).toBe('uid:u1')
		})

		it('token inválido ou ausente cai no IP', () => {
			expect(mcpRateLimitKey(request('Bearer garbage'))).toBe('ip:10.0.0.1-ua')
			expect(mcpRateLimitKey(request())).toBe('ip:10.0.0.1-ua')
		})

		it('a faixa do /mcp é folgada para conversa e curta para varredura', () => {
			expect(rateLimitConfigs.mcp.max).toBe(600)
			expect(rateLimitConfigs.mcp.timeWindow).toBe('15 minutes')
		})
	})
})
