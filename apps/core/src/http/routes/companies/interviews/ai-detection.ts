import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { env } from '@/env'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createInterviewsService } from '@/lib/services/interviews-service'
import type { UsersCompany } from '@coploy/domain'
import { engineDetectionResponseSchema } from '@coploy/shared/contracts'
import { BadRequestError } from '@coploy/shared/errors'

export function aiDetection(app: FastifyInstance) {
  const interviewsService = createInterviewsService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .post(
      '/companies/interviews/:id/ai-detection',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['interviews'],
          security: [{ bearerAuth: [] }],
          summary: 'Trigger AI detection (cheat detection) for an interview',
          params: z.object({
            id: z.string(),
          }),
          response: {
            200: z.object({
              success: z.boolean(),
              message: z.string(),
              jobAppliedId: z.string(),
            }),
            400: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const userId = await request.getCurrentUser()
        const user = (await interviewsService.getUsersCompany(userId)) as UsersCompany | null

        if (!user) {
          throw new BadRequestError('User not found')
        }

        const { id: jobAppliedId } = request.params

        // Busca o jobApplied para validar
        const jobApplied = await interviewsService.getJobApplied(
          userId,
          jobAppliedId,
        )

        if (!jobApplied) {
          throw new BadRequestError('Interview not found')
        }

        // Chama o endpoint do coploy-engine
        const engineUrl = `${env.ENGINE_URL}/ai-detection/detect`

        try {
          const response = await fetch(engineUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Request-Id': request.id,
            },
            body: JSON.stringify({
              jobAppliedId,
              userId,
              companyId: user.company!.id,
            }),
          })

          if (!response.ok) {
            const error = (await response.json()) as { message?: string }
            throw new BadRequestError(
              error.message || 'Failed to trigger AI detection'
            )
          }

          const result = await response.json()
          const parsed = engineDetectionResponseSchema.safeParse(result)
          if (!parsed.success || !parsed.data.success) {
            throw new BadRequestError('AI Engine retornou resposta inválida')
          }

          return reply.status(200).send({
            success: true,
            message: 'AI detection triggered successfully',
            jobAppliedId,
          })
        } catch (error) {
          console.error('Error triggering AI detection:', error)
          throw new BadRequestError(
            error instanceof Error
              ? error.message
              : 'Failed to trigger AI detection'
          )
        }
      }
    )
}
