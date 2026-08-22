import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { firebaseAdminAuth } from '@/lib/init'
import { authDreamJobs } from '../middlewares/authDreamJobs'

export function getSessionToken(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(authDreamJobs)
    .get(
      '/dream-jobs/session-token',
      {
        schema: {
          'x-surface': 'candidato',
          tags: ['dream_jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Generate a custom token for cross-domain authentication',
          description:
            'Generates a Firebase custom token that can be used to authenticate in another domain (e.g., interview-web)',
          response: {
            200: z.object({
              sessionToken: z.string(),
            }),
            401: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const userId = await request.getCurrentUser()

        // Gera um custom token Firebase para o usuário
        // Este token pode ser usado com signInWithCustomToken no cliente
        const sessionToken = await firebaseAdminAuth.createCustomToken(userId)

        return reply.status(200).send({
          sessionToken,
        })
      }
    )
}
