import type { FastifyCorsOptions } from '@fastify/cors'
import { env } from '@/env'

/**
 * Lista de origens permitidas por ambiente
 * Mantém controle explícito sobre quais domínios podem acessar a API
 */
const ALLOWED_ORIGINS: Record<string, string[]> = {
  // As origens desta instalação vêm do ambiente: DOMAIN cobre os subdomínios
  // reais, e localhost fica liberado em qualquer porta (a primeira execução é
  // um `docker compose up` na máquina de quem instalou). Ver
  // isSelfHostedOriginAllowed abaixo.
  production: [],
  homolog: [],
  testing: ['http://localhost:3000', 'http://localhost:3333', 'http://127.0.0.1:3000'],
}

/**
 * Padrões regex para validação de subdomínios dinâmicos
 */
const DYNAMIC_ORIGIN_PATTERNS: RegExp[] = []

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

function isSelfHostedOriginAllowed(origin: string): boolean {
  if (env.INFRA_PROVIDER !== 'selfhosted') {
    return false
  }

  /*
   * localhost liberado em qualquer porta: a primeira execução da distribuição
   * open é `docker compose up` na máquina da pessoa, com o ATS em
   * http://localhost:8080 falando com a API em http://localhost:3333 — sem
   * domínio nenhum ainda. Só vale com INFRA_PROVIDER=selfhosted; no SaaS a
   * lista explícita continua mandando.
   */
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)) {
    return true
  }

  const domain = process.env.DOMAIN ? normalizeDomain(process.env.DOMAIN) : null

  if (domain) {
    const domainPattern = new RegExp(
      `^https?:\\/\\/(?:[a-z0-9-]+\\.)+${escapeRegex(domain)}(?::\\d+)?$`,
      'i',
    )

    if (domainPattern.test(origin)) {
      return true
    }
  }

  // Fallback para validação rápida sem domínio real (sslip/nip)
  return (
    /^https?:\/\/[a-z0-9.-]+\.sslip\.io(?::\d+)?$/i.test(origin) ||
    /^https?:\/\/[a-z0-9.-]+\.nip\.io(?::\d+)?$/i.test(origin)
  )
}

/**
 * Verifica se a origem é permitida
 */
function isOriginAllowed(origin: string, environment: string): boolean {
  if (isSelfHostedOriginAllowed(origin)) {
    return true
  }

  const allowedList = ALLOWED_ORIGINS[environment] || ALLOWED_ORIGINS.homolog

  // Verificar lista estática de origens
  if (allowedList.includes(origin)) {
    return true
  }

  // Verificar padrões dinâmicos (subdomínios)
  for (const pattern of DYNAMIC_ORIGIN_PATTERNS) {
    if (pattern.test(origin)) {
      return true
    }
  }

  return false
}

/**
 * Configuração CORS para produção
 * Aplica validação rigorosa de origens
 */
function getProductionCorsConfig(): FastifyCorsOptions {
  return {
    origin: (origin, callback) => {
      // Permitir requisições sem origin (mobile apps, Postman, server-to-server)
      if (!origin) {
        return callback(null, true)
      }

      if (isOriginAllowed(origin, 'production')) {
        return callback(null, true)
      }

      // Log de tentativa de acesso não autorizado (para auditoria)
      console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`)

      const error = new Error(`CORS policy: Origin '${origin}' is not allowed`)
      error.name = 'CORSError'
      return callback(error, false)
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Api-Key',
      'X-HM-Access-Token',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    credentials: true,
    maxAge: 86400, // 24 horas - cache do preflight
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }
}

/**
 * Configuração CORS para desenvolvimento/homologação
 * Mais permissiva para facilitar desenvolvimento
 */
function getDevelopmentCorsConfig(): FastifyCorsOptions {
  return {
    origin: (origin, callback) => {
      // Permitir requisições sem origin
      if (!origin) {
        return callback(null, true)
      }

      // Em homolog, verificar lista mas ser mais permissivo
      if (isOriginAllowed(origin, env.NODE_ENV)) {
        return callback(null, true)
      }

      // Log informativo em desenvolvimento
      if (env.NODE_ENV === 'homolog') {
        console.info(`[CORS] Request from origin: ${origin}`)
      }

      // Em homolog/testing, permitir todas as origens
      return callback(null, true)
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Api-Key',
      'X-HM-Access-Token',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    credentials: true,
    maxAge: 600, // 10 minutos em dev
  }
}

/**
 * Retorna a configuração CORS apropriada para o ambiente atual
 */
export function getCorsConfig(): FastifyCorsOptions {
  const isProduction = env.NODE_ENV === 'production'

  return isProduction ? getProductionCorsConfig() : getDevelopmentCorsConfig()
}

/**
 * Exporta lista de origens para documentação/debug
 */
export function getAllowedOrigins(): string[] {
  return ALLOWED_ORIGINS[env.NODE_ENV] || ALLOWED_ORIGINS.homolog
}
