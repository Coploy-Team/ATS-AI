import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Stub do espelho público.
 *
 * Na edição hospedada este middleware valida a assinatura da empresa contra o
 * plano contratado. Esta distribuição não cobra ninguém: não há plano a
 * validar, e o acesso é decidido só pelas permissões do papel.
 */
export const subscriptionMiddleware = fp(async (_app: FastifyInstance) => {})
