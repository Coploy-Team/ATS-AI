import type { FastifyInstance } from 'fastify'
import { fastifyPlugin } from 'fastify-plugin'

import { firebaseAdminAuth } from '@/lib/init'
import { secureLogger } from '@coploy/shared/utils'
import { UnauthorizedError } from '@coploy/shared/errors'

export const authDreamJobs = fastifyPlugin(async (app: FastifyInstance) => {
  app.addHook('preHandler', async (request) => {
    request.getCurrentUser = async () => {
      try {
        const authHeader = request?.headers?.authorization
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError('Missing or invalid authorization header')
        }

        const token = authHeader.split('Bearer ')[1]
        const decodedToken = await firebaseAdminAuth.verifyIdToken(token)
        return decodedToken.uid
      } catch (e: any) {
        secureLogger.authError(
          'Failed to verify auth token',
          undefined,
          request
        )
        throw new UnauthorizedError('Invalid auth token')
      }
    }
    request.getAccessToken = async () => {
      const authHeader = request.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid authorization header')
      }
      return authHeader.split('Bearer ')[1]
    }
  })
})
