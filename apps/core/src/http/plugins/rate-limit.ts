import type { RateLimitOptions } from '@fastify/rate-limit'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import fastifyPlugin from 'fastify-plugin'
import { env } from '@/env'

// Configurações padrão de rate limiting
const defaultConfig: Partial<RateLimitOptions> = {
	max: 100, // máximo de 100 requisições
	timeWindow: '15 minutes', // em 15 minutos
	skipOnError: false, // contar requisições com erro também
	// Usar IP + User-Agent como chave de identificação
	keyGenerator: (request) => {
		return `${request.ip}-${request.headers['user-agent']}`
	},
	// Mensagem personalizada quando limite é excedido
	errorResponseBuilder: (_request, context) => ({
		error: 'Rate limit exceeded',
		message: `Muitas requisições. Tente novamente em ${Math.round(context.ttl / 1000)} segundos.`,
		statusCode: 429,
		remainingTime: Math.round(context.ttl / 1000),
	}),
}

// Verificar se está em ambiente de desenvolvimento
const isDevelopment = env.NODE_ENV === 'homolog' || env.NODE_ENV === 'testing'

// Configurações específicas para diferentes tipos de rota
export const rateLimitConfigs = {
	// Rotas de autenticação (mais restritivas)
	auth: {
		max: isDevelopment ? 1000 : 10, // Em dev: 1k req/15min, Em prod: 10 req/15min
		timeWindow: '15 minutes',
		errorResponseBuilder: (_request, context) => ({
			error: 'Authentication rate limit exceeded',
			message: 'Muitas tentativas de login. Tente novamente em alguns minutos.',
			statusCode: 429,
			remainingTime: Math.round(context.ttl / 1000),
		}),
	} as Partial<RateLimitOptions>,

	// Rotas de IA (mais restritivas devido ao custo computacional)
	ia: {
		max: isDevelopment ? 1000 : 30, // Em dev: 1k req/hora, Em prod: 30 req/hora
		timeWindow: '1 hour',
		errorResponseBuilder: (_request, context) => ({
			error: 'AI service rate limit exceeded',
			message: 'Limite de uso da IA atingido. Tente novamente mais tarde.',
			statusCode: 429,
			remainingTime: Math.round(context.ttl / 1000),
		}),
	} as Partial<RateLimitOptions>,

	// Rotas públicas (menos restritivas)
	public: {
		max: isDevelopment ? 10000 : 50, // Em dev: 10k req/15min, Em prod: 50 req/15min
		timeWindow: '15 minutes',
	} as Partial<RateLimitOptions>,

	// Upload de arquivos (mais restritiva)
	upload: {
		max: isDevelopment ? 1000 : 20, // Em dev: 1k req/hora, Em prod: 20 req/hora
		timeWindow: '1 hour',
	} as Partial<RateLimitOptions>,

	// Rotas de webhook e billing (críticas)
	webhook: {
		max: 1000,
		timeWindow: '1 minute',
		keyGenerator: (request) => {
			// Para webhooks, usar o header de origem ou IP
			return request.headers['stripe-signature'] || request.ip
		},
	} as Partial<RateLimitOptions>,
}

// Plugin principal de rate limiting
export const rateLimitPlugin = fastifyPlugin(
	async (fastify: FastifyInstance) => {
		// Registro global do rate limiting (desabilitado por padrão)
		await fastify.register(rateLimit, {
			...defaultConfig,
			global: false, // Não aplicar globalmente, apenas onde especificado
		})
	},
)
