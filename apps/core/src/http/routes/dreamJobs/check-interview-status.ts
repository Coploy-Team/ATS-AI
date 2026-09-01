import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { User } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { authDreamJobs } from '../middlewares/authDreamJobs'
import { toDate } from '@/lib/date-formatter'
import { createDreamJobsService } from '@/lib/services/dreamjobs-service'

const checkInterviewStatusResponseSchema = z.object({
  hasInterview: z.boolean(),
  interview: z
    .object({
      jobId: z.string(),
      jobAppliedId: z.string().nullable(),
      createdAt: z.date(),
      status: z.enum(['pending', 'in_progress', 'completed']),
      completedAt: z.date().nullable(),
    })
    .nullable(),
})

export async function checkInterviewStatus(app: FastifyInstance) {
  const dreamJobsService = createDreamJobsService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(authDreamJobs)
    .get(
      '/dream-jobs/check-interview-status',
      {
        schema: {
        'x-surface': 'candidato',
        tags: ['dream-jobs'],
        summary: 'Check if user already has a Dream Jobs interview',
        security: [{ bearerAuth: [] }],
        response: {
          200: checkInterviewStatusResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = await request.getCurrentUser()

        if (!userId) {
          throw new BadRequestError('User ID not found')
        }

        // Buscar dados do usuário
        const user = (await dreamJobsService.getUser(userId)) as User | null

        if (!user) {
          throw new BadRequestError('User not found')
        }

        // Verificar se tem entrevista Dream Jobs
        const hasInterview = !!user.dreamJobsInterview

        return reply.status(200).send({
          hasInterview,
          interview: user.dreamJobsInterview
            ? {
                jobId: user.dreamJobsInterview.jobId ?? '',
                jobAppliedId: user.dreamJobsInterview.jobAppliedId || null,
                createdAt: toDate(user.dreamJobsInterview.createdAt)!,
                status: user.dreamJobsInterview.status as 'pending' | 'in_progress' | 'completed',
                completedAt:
                  toDate(user.dreamJobsInterview.completedAt),
              }
            : null,
        })
      } catch (error: any) {
        console.error('Error checking interview status:', error)
        throw new BadRequestError(
          error.message || 'Error checking interview status'
        )
      }
    }
  )
}
