import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { User } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { authDreamJobs } from '../middlewares/authDreamJobs'
import { createDreamJobsService } from '@/lib/services/dreamjobs-service'

const linkInterviewBodySchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  jobAppliedId: z.string().min(1, 'JobApplied ID is required').optional(),
})

const linkInterviewResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export async function linkInterview(app: FastifyInstance) {
  const dreamJobsService = createDreamJobsService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(authDreamJobs)
    .post(
      '/dream-jobs/link-interview',
      {
        schema: {
        'x-surface': 'candidato',
        tags: ['dream-jobs'],
        summary: 'Link a Dream Jobs interview to the user profile',
        security: [{ bearerAuth: [] }],
        body: linkInterviewBodySchema,
        response: {
          200: linkInterviewResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        console.log('[link-interview] 1. Iniciando processo...')
        const userId = await request.getCurrentUser()
        console.log('[link-interview] 2. userId obtido:', userId)

        if (!userId) {
          throw new BadRequestError('User ID not found')
        }

        const { jobId, jobAppliedId } = request.body
        console.log('[link-interview] 3. Body recebido:', { jobId, jobAppliedId })

        // Buscar dados do usuário para verificar se já tem entrevista
        console.log('[link-interview] 4. Buscando usuário no Firestore...')
        const user = (await dreamJobsService.getUser(userId)) as User | null
        console.log('[link-interview] 5. Usuário encontrado:', !!user)
        console.log('[link-interview] 5.1. Usuário completo:', JSON.stringify(user, null, 2))

        if (!user) {
          throw new BadRequestError('User not found')
        }

        // Verificar se já tem uma entrevista vinculada
        console.log('[link-interview] 6. Verificando dreamJobsInterview existente:', user.dreamJobsInterview)
        if (user.dreamJobsInterview) {
          throw new BadRequestError(
            'User already has a Dream Jobs interview linked'
          )
        }

        // Atualizar o usuário com a referência da entrevista
        console.log('[link-interview] 7. Criando interviewData...')
        const interviewData: any = {
          jobId,
          createdAt: new Date(),
          status: 'pending',
        }

        // Adiciona jobAppliedId apenas se fornecido
        if (jobAppliedId) {
          interviewData.jobAppliedId = jobAppliedId
        }
        console.log('[link-interview] 7.1. interviewData criado:', interviewData)

        console.log('[link-interview] 8. Atualizando usuário no Firestore...')
        await dreamJobsService.updateUser(userId, {
          dreamJobsInterview: interviewData,
        })
        console.log('[link-interview] 9. Sucesso!')

        return reply.status(200).send({
          success: true,
          message: 'Interview linked successfully',
        })
      } catch (error: any) {
        console.error('[link-interview] ERRO CAPTURADO:', error)
        console.error('[link-interview] ERRO MESSAGE:', error.message)
        console.error('[link-interview] ERRO STACK:', error.stack)
        throw new BadRequestError(error.message || 'Error linking interview')
      }
    }
  )
}
