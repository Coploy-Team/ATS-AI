import type { RateLimitOptions } from '@fastify/rate-limit'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fastifyPlugin from 'fastify-plugin'

import { env } from '@/env'
import { verifyToken, type AccessTokenPayload } from '@/lib/oauth/jwt'

/**
 * Limite de taxa do MCP — as mesmas faixas e o mesmo shape de erro do plugin
 * do core (`apps/core/src/http/plugins/rate-limit.ts`), para o cliente ver
 * uma API só.
 *
 * Por que aqui: o registro OAuth (DCR) e o token endpoint são públicos por
 * desenho — qualquer um se registra como cliente e tenta trocar código. Sem
 * teto, o `/oauth/authorize/submit` vira força bruta de senha de candidato
 * e o `/oauth/register` vira gerador de JWT à vontade. Vale para o SaaS de
 * hoje; abrir o código (F1) só torna o buraco mais fácil de achar.
 */

const isDevelopment = env.NODE_ENV === 'homolog' || env.NODE_ENV === 'testing'

const byIpAndAgent = (request: FastifyRequest) => `${request.ip}-${request.headers['user-agent']}`

const errorResponse = (error: string, message: string): RateLimitOptions['errorResponseBuilder'] =>
	(_request, context) => ({
		error,
		message,
		statusCode: 429,
		remainingTime: Math.round(context.ttl / 1000),
	})

/**
 * Quem está autenticado conta pela CONTA, não pelo IP: dezenas de pessoas
 * atrás do mesmo NAT (ou do mesmo egress do ChatGPT) não podem dividir um
 * único balde. Token ausente ou inválido cai no IP, que é o que se tem.
 */
export function mcpRateLimitKey(request: FastifyRequest): string {
	const header = request.headers.authorization
	if (header?.startsWith('Bearer ')) {
		const claims = verifyToken<AccessTokenPayload>(
			header.slice('Bearer '.length),
			env.MCP_OAUTH_SIGNING_SECRET,
			'access',
		)
		if (claims?.uid) return `uid:${claims.uid}`
	}
	return `ip:${byIpAndAgent(request)}`
}

export const rateLimitConfigs = {
	/** Rotas de autenticação (registro DCR, token, login/cadastro do consent). */
	auth: {
		max: isDevelopment ? 1000 : 10,
		timeWindow: '15 minutes',
		keyGenerator: byIpAndAgent,
		errorResponseBuilder: errorResponse(
			'Authentication rate limit exceeded',
			'Muitas tentativas de login. Tente novamente em alguns minutos.',
		),
	} as Partial<RateLimitOptions>,

	/**
	 * O endpoint MCP: cada mensagem do assistente é um POST (tools/list,
	 * tools/call...), e uma conversa normal gasta dezenas por minuto. A faixa é
	 * folgada para uso real e curta para varredura.
	 */
	mcp: {
		max: isDevelopment ? 10000 : 600,
		timeWindow: '15 minutes',
		keyGenerator: mcpRateLimitKey,
		errorResponseBuilder: errorResponse(
			'Rate limit exceeded',
			'Muitas requisições. Tente novamente em alguns minutos.',
		),
	} as Partial<RateLimitOptions>,
}

export const rateLimitPlugin = fastifyPlugin(async (fastify: FastifyInstance) => {
	await fastify.register(rateLimit, {
		max: 100,
		timeWindow: '15 minutes',
		skipOnError: false,
		keyGenerator: byIpAndAgent,
		// Só onde a rota declarar `config.rateLimit`; o resto (health, metadata,
		// OTS público) segue sem teto próprio, como no core.
		global: false,
	})
})
