import fastifyCors from '@fastify/cors'
import fastifyMultipart from '@fastify/multipart'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUI from '@fastify/swagger-ui'
import { fastify } from 'fastify'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { isSelfHosted } from '@coploy/shared/env'
import { requestIdResponse } from '@coploy/shared/middleware'
import { getCorsConfig } from '@/config/cors'
import { env } from '@/env'
import { getInfra, initializeInfra } from '@/lib/init'
import { startSelfHostedOutboxConsumer } from '@/lib/events/selfhosted-outbox-consumer'
import { errorHandler } from './error-handle'
import { rateLimitPlugin } from './plugins/rate-limit'
import { securityHeadersPlugin } from './plugins/security-headers'
import { registerRoutes } from './routes'
import type { FastifyInstance } from 'fastify'

const REQUEST_ID_HEADER = 'x-request-id'

async function main() {
  await initializeInfra()
  const maxUploadBytes = env.UPLOAD_MAX_FILE_MB * 1024 * 1024

  const app = fastify({
    bodyLimit: maxUploadBytes,
    genReqId: (req) => {
      const incoming = (req.headers as Record<string, string | string[] | undefined>)[REQUEST_ID_HEADER]
      if (typeof incoming === 'string' && incoming.length > 0) {
        return incoming
      }
      return crypto.randomUUID()
    },
    logger: {
      level: 'error',
    },
  }).withTypeProvider<ZodTypeProvider>()

  app.decorate('infra', getInfra())

  app.setSerializerCompiler(serializerCompiler)
  app.setValidatorCompiler(validatorCompiler)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.setErrorHandler(errorHandler as any)
  app.register(requestIdResponse)
  app.register(securityHeadersPlugin)
  app.register(rateLimitPlugin)
  app.register(fastifyMultipart, {
    limits: {
      fieldSize: 10 * 1024 * 1024,
      fileSize: maxUploadBytes,
      files: 10,
    },
  })

  if (isSelfHosted()) {
    const { getBetterAuthInstance } = await import('@/lib/init')
    const { registerBetterAuthRoutes } = await import('./plugins/betterauth-routes')
    startSelfHostedOutboxConsumer(getInfra())
    registerBetterAuthRoutes(app as unknown as FastifyInstance, getBetterAuthInstance())
  }

  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'coploy api recruiter',
        description: 'api for coploy recruiter',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  })

  const isProduction = env.NODE_ENV === 'production'

  app.register(fastifyCors, getCorsConfig())
  app.get('/health', async () => ({ status: 'ok' }))

  if (!isProduction) {
    app.register(fastifySwaggerUI, {
      routePrefix: '/docs',
      uiConfig: {
        deepLinking: true,
      },
      transformSpecification: (swaggerObject) => {
        const allowedRoutes: Record<string, string[]> = {
          '/sessions/password': ['post'],
          '/ia/job-description': ['post'],
          '/ia/skill-description': ['post'],
          '/ia/questions': ['post'],
          '/ia/evaluation-questions': ['post'],
          '/companies/jobs': ['post'],
          '/companies/jobs/{slug}': ['get'],
          '/companies/interviews': ['get'],
          '/admin/users/purge': ['post'],
          '/admin/users/purge-orphans': ['post'],
        }

        if (swaggerObject.paths) {
          for (const path of Object.keys(swaggerObject.paths)) {
            const allowedMethods = allowedRoutes[path]

            if (!allowedMethods) {
              delete swaggerObject.paths[path]
              continue
            }

            const methods = swaggerObject.paths[path]
            for (const method of Object.keys(methods)) {
              if (!allowedMethods.includes(method)) {
                delete methods[method]
              }
            }

            if (Object.keys(methods).length === 0) {
              delete swaggerObject.paths[path]
            }
          }
        }

        return swaggerObject
      },
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.register(registerRoutes as any)

  await app.listen({ port: env.SERVER_PORT, host: '0.0.0.0' })
  console.info(`[Core] Running on port ${env.SERVER_PORT}`)
}

main()
