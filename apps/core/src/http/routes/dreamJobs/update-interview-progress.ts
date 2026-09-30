import type { FastifyInstance } from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authDreamJobs } from '../middlewares/authDreamJobs'

import type { User } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { createDreamJobsService } from '@/lib/services/dreamjobs-service'

const updateInterviewProgressBodySchema = z.object({
  jobAppliedId: z.string().min(1, 'JobApplied ID is required').optional(),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
})

const updateInterviewProgressResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export async function updateInterviewProgress(app: FastifyInstance) {
  const dreamJobsService = createDreamJobsService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(authDreamJobs)
    .patch(
      '/dream-jobs/update-interview-progress',
      {
        schema: {
        'x-surface': 'candidato',
        tags: ['dream-jobs'],
        summary: 'Update Dream Jobs interview progress',
        security: [{ bearerAuth: [] }],
        body: updateInterviewProgressBodySchema,
        response: {
          200: updateInterviewProgressResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = await request.getCurrentUser()

        if (!userId) {
          throw new BadRequestError('User ID not found')
        }

        const { jobAppliedId, status } = request.body

        // Buscar dados do usuário
        const user = await dreamJobsService.getUser(userId) as User | null

        if (!user) {
          throw new BadRequestError('User not found')
        }

        // Verificar se tem entrevista vinculada
        if (!user.dreamJobsInterview) {
          throw new BadRequestError('User does not have a Dream Jobs interview linked')
        }

        // Preparar atualização
        const updates: any = {}

        if (jobAppliedId) {
          updates['dreamJobsInterview.jobAppliedId'] = jobAppliedId
        }

        if (status) {
          updates['dreamJobsInterview.status'] = status

          if (status === 'completed') {
            updates['dreamJobsInterview.completedAt'] = new Date()
          }
        }

        // Atualizar o usuário
        await dreamJobsService.updateUser(userId, updates)

        return reply.status(200).send({
          success: true,
          message: 'Interview progress updated successfully',
        })
      } catch (error: any) {
        console.error('Error updating interview progress:', error)
        throw new BadRequestError(error.message || 'Error updating interview progress')
      }
    },
  )
}
