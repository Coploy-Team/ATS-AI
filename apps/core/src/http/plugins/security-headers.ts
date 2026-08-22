import type { FastifyInstance } from 'fastify'
import fastifyPlugin from 'fastify-plugin'
import { env } from '@/env'

/**
 * Plugin de Security Headers
 * Adiciona headers de segurança essenciais para proteger contra ataques comuns
 */
export const securityHeadersPlugin = fastifyPlugin(
	async (fastify: FastifyInstance) => {
		// Hook que adiciona headers de segurança a todas as respostas
		fastify.addHook('onSend', async (request, reply, payload) => {
			// Determinar se está em produção
			const isProduction = env.NODE_ENV === 'production'
			const publicUrlProtocol = (process.env.PUBLIC_URL_PROTOCOL ?? 'https').toLowerCase()
			const forwardedProtoHeader = request.headers['x-forwarded-proto']
			const forwardedProto = Array.isArray(forwardedProtoHeader)
				? forwardedProtoHeader[0]
				: forwardedProtoHeader
			const requestProtocol = forwardedProto?.split(',')[0]?.trim()?.toLowerCase()
			const isHttpsRequest = requestProtocol === 'https'

			// 1. X-Content-Type-Options
			// Previne MIME-type sniffing attacks
			reply.header('X-Content-Type-Options', 'nosniff')

			// 2. X-Frame-Options
			// Previne clickjacking attacks
			reply.header('X-Frame-Options', 'DENY')

			// 3. X-XSS-Protection (legacy, mas ainda usado por alguns browsers)
			// Habilita filtro XSS built-in do browser
			reply.header('X-XSS-Protection', '1; mode=block')

			// 4. Referrer-Policy
			// Controla que informações são enviadas no header Referrer
			reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')

			// 5. Content-Security-Policy (CSP)
			// Políticas rigorosas para prevenir XSS
			const cspDirectives = [
				"default-src 'self'",
				"script-src 'self'",
				"style-src 'self' 'unsafe-inline'", // unsafe-inline pode ser necessário para alguns estilos
				"img-src 'self' data: https:",
				"connect-src 'self'",
				"font-src 'self'",
				"object-src 'none'",
				"media-src 'self'",
				"frame-src 'none'",
				"base-uri 'self'",
				"form-action 'self'",
			]
			reply.header('Content-Security-Policy', cspDirectives.join('; '))

			// 6. Strict-Transport-Security (HSTS) - apenas quando o acesso público usa HTTPS
			if (isProduction && publicUrlProtocol === 'https' && isHttpsRequest) {
				reply.header(
					'Strict-Transport-Security',
					'max-age=31536000; includeSubDomains; preload',
				)
			}

			// 7. Permissions-Policy (successor do Feature-Policy)
			// Desabilita APIs potencialmente perigosas
			const permissionsPolicies = [
				'camera=()',
				'microphone=()',
				'geolocation=()',
				'payment=()',
				'usb=()',
				'magnetometer=()',
				'gyroscope=()',
				'accelerometer=()',
				'ambient-light-sensor=()',
			]
			reply.header('Permissions-Policy', permissionsPolicies.join(', '))

			// 8. X-Permitted-Cross-Domain-Policies
			// Controla políticas de cross-domain para Adobe Flash e PDF
			reply.header('X-Permitted-Cross-Domain-Policies', 'none')

			// 9. Cache-Control para rotas sensíveis
			// Previne cache de dados sensíveis
			if (
				request.url.includes('/auth') ||
				request.url.includes('/profile') ||
				request.url.includes('/companies')
			) {
				reply.header(
					'Cache-Control',
					'no-store, no-cache, must-revalidate, proxy-revalidate',
				)
				reply.header('Pragma', 'no-cache')
				reply.header('Expires', '0')
			}

			// 10. X-API-Version (custom header para versionamento)
			reply.header('X-API-Version', '1.0.0')

			// 11. X-Rate-Limit-* headers já são adicionados pelo rate-limit plugin

			return payload
		})

		// Log de inicialização
		fastify.log.info('Security headers plugin loaded successfully')
	},
)

// Configurações específicas para diferentes tipos de conteúdo
export const getCSPForRoute = (routePath: string): string => {
	// CSP mais restritiva para rotas de autenticação
	if (routePath.includes('/auth') || routePath.includes('/sessions')) {
		return [
			"default-src 'self'",
			"script-src 'self'",
			"style-src 'self'",
			"img-src 'self'",
			"connect-src 'self'",
			"font-src 'self'",
			"object-src 'none'",
			"media-src 'none'",
			"frame-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		].join('; ')
	}

	// CSP para upload de arquivos
	if (routePath.includes('/upload')) {
		return [
			"default-src 'self'",
			"script-src 'self'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: blob:",
			"connect-src 'self'",
			"font-src 'self'",
			"object-src 'none'",
			"media-src 'self' blob:",
			"frame-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		].join('; ')
	}

	// CSP padrão
	return [
		"default-src 'self'",
		"script-src 'self'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"connect-src 'self'",
		"font-src 'self'",
		"object-src 'none'",
		"media-src 'self'",
		"frame-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join('; ')
}

// Função helper para verificar se uma rota é sensível
export const isSensitiveRoute = (routePath: string): boolean => {
	const sensitivePatterns = [
		'/auth',
		'/sessions',
		'/profile',
		'/companies/collaborators',
		'/companies/billing',
		'/users',
	]

	return sensitivePatterns.some((pattern) => routePath.includes(pattern))
}
