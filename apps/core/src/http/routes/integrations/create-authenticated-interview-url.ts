import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError, UnauthorizedError } from '@coploy/shared/errors'
import { createIntegrationsService } from '@/lib/services/integrations-service'

const bodySchema = z.object({
  interviewUrl: z.string().url(),
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
})

export function createAuthenticatedInterviewUrl(app: FastifyInstance) {
  const integrationsSvc = createIntegrationsService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .post(
      '/integrations/interview/authenticated-url',
      {
        schema: {
          'x-surface': 'integracoes',
          tags: ['integrations'],
          summary: 'Generate an authenticated interview URL for a candidate',
          description:
            'Finds or creates a candidate by email, generates a session token, and returns the interview URL with automatic login. Authenticated via company API key.',
          headers: z.object({
            'x-api-key': z.string().describe('API Key da empresa'),
          }),
          body: bodySchema,
          response: {
            200: z.object({
              authenticatedUrl: z.string(),
              userId: z.string(),
              isNewUser: z.boolean(),
            }),
            400: z.object({
              message: z.string(),
            }),
            401: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const apiKey = request.headers['x-api-key']
        if (!apiKey) {
          throw new UnauthorizedError('API Key não fornecida')
        }

        const company = await integrationsSvc.getCompanyByApiKey(apiKey)
        if (!company) {
          throw new UnauthorizedError('API Key inválida')
        }

        const result = await integrationsSvc.createAuthenticatedInterviewUrl(request.body)

        if (!result.success) {
          return reply.status(400).send({ message: result.error })
        }

        return reply.status(200).send({
          authenticatedUrl: result.authenticatedUrl,
          userId: result.userId,
          isNewUser: result.isNewUser,
        })
      },
    )
}
