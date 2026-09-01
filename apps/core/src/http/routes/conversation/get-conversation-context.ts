import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import {
  conversationStatusSchema,
  conversationStepSchema,
} from '@/schemas/conversation-context-schema'
import {
  type ConversationContext,
  ConversationStep,
} from '@/types/conversation-context'
import type { PostJob } from '@coploy/domain'
import { BadRequestError } from '@coploy/shared/errors'
import { toDate } from '@/lib/date-formatter'
import { apiKeyAuthMiddleware } from '@/http/routes/middlewares/api-key-auth'
import { createConversationService } from '@/lib/services/conversation-service'

const parseIds = (msg?: string) => {
  const ids = msg?.split?.(': ')?.[1]?.trim()?.split('/') || null
  if (!ids || ids.length !== 2)
    return {
      jobId: null as string | null,
      companyId: null as string | null,
      valid: false,
    }
  const jobId = ids[0]?.trim() || null
  const companyId = ids[1]?.trim() || null
  return { jobId, companyId, valid: Boolean(jobId && companyId) }
}

const isStartIntent = (msg?: string) => {
  if (!msg) return false
  return /^\s*ol[aá]\s+quero\s+iniciar\s+minha\s+entrevista\s*:/i.test(msg)
}

export function getConversationContext(app: FastifyInstance) {
  const conversationService = createConversationService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(apiKeyAuthMiddleware)
    .get(
    '/conversation-context/:phone',
    {
      schema: {
        tags: ['conversation'],
        summary: 'Get conversation context by phone number',
        description:
          'Rota interna (canal WhatsApp). Requer header `x-api-key` com a CORE_API_KEY.',
        params: z.object({
          phone: z
            .string()
            .min(10, 'Número de telefone deve ter pelo menos 10 dígitos'),
        }),
        querystring: z.object({
          message: z.string().max(500).optional(),
        }),
        response: {
          200: z.object({
            id: z.string(),
            phone: z.string(),
            step: conversationStepSchema,
            email: z.string().nullable(),
            password: z.string().nullable(),
            interviewId: z.string().nullable(),
            jobId: z.string().nullable(),
            companyId: z.string().nullable(),
            currentQuestionId: z.string().nullable(),
            lastMessage: z.string(),
            status: conversationStatusSchema,
            retryCount: z.number(),
            maxRetries: z.number(),
            createdAt: z.string(),
            updatedAt: z.string(),
            language: z.string().nullable().optional(),
          }),
          401: z.object({
            message: z.string(),
          }),
          404: z.object({
            message: z.string(),
          }),
          409: z.object({
            message: z.string(),
            jobId: z.string().nullable().optional(),
            companyId: z.string().nullable().optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      if (!request.validateApiKey) {
        throw new BadRequestError('API Key middleware não configurado')
      }
      await request.validateApiKey()

      const { phone } = request.params
      const { message } = request.query

      try {
        const activeRows = (await conversationService.listConversationContexts(phone, {
          filters: [{ field: 'status', operator: '==', value: 'active' }],
        })) as ConversationContext[]

        const startIntent = isStartIntent(message)

        if (activeRows.length > 0) {
          const ctx = activeRows[0] as ConversationContext

          if (startIntent)
            return reply.status(409).send({
              message: 'Você já possui uma entrevista iniciada.',
              jobId: ctx.jobId ?? null,
              companyId: ctx.companyId ?? null,
            })

          // Buscar idioma da vaga usando o caminho correto da subcoleção
          let jobLanguage: string | null = null
          if (ctx.jobId && ctx.companyId) {
            try {
              const job = await conversationService.getJob(ctx.companyId!, ctx.jobId!)
              jobLanguage = (job as PostJob | null)?.language ?? null
            } catch (error) {
              console.error('Erro ao buscar idioma da vaga:', error)
            }
          }

          const baseResponse = {
            id: ctx.id,
            phone: ctx.phone,
            step: ctx.step,
            email: ctx.email,
            password: ctx.password,
            interviewId: ctx.interviewId,
            jobId: ctx.jobId,
            companyId: ctx.companyId,
            currentQuestionId: ctx.currentQuestionId,
            lastMessage: ctx.lastMessage,
            status: ctx.status,
            retryCount: ctx.retryCount,
            maxRetries: ctx.maxRetries,
            createdAt: (toDate(ctx.createdAt) ?? new Date()).toISOString(),
            updatedAt: (toDate(ctx.updatedAt) ?? new Date()).toISOString(),
            language: jobLanguage,
          }

          // if (ctx.step === ConversationStep.AskNextQuestion) {
          //   const transitionDate = new Date()

          //   await firestoreDB.update<ConversationContext>(
          //     collectionPath.join('/'),
          //     ctx.id,
          //     {
          //       step: ConversationStep.WaitingAnswer,
          //       retryCount: 0,
          //       updatedAt: transitionDate as any,
          //     }
          //   )

          //   return reply.status(200).send({
          //     ...baseResponse,
          //     step: ConversationStep.WaitingAnswer,
          //     retryCount: 0,
          //     updatedAt: transitionDate.toISOString(),
          //   })
          // }

          return reply.status(200).send(baseResponse)
        }

        const { jobId, companyId, valid } = parseIds(message)

        if (!valid)
          return reply.status(404).send({
            message: 'Contexto de conversa não encontrado.',
          })

        // Verificar se já existe uma entrevista finalizada para esta vaga/empresa
        if (startIntent && jobId && companyId) {
          const allInterviews = (await conversationService.listConversationContexts(phone)) as ConversationContext[]

          const hasFinishedInterview = allInterviews.some(
            (ctx) =>
              ctx.jobId === jobId &&
              ctx.companyId === companyId &&
              ctx.step === ConversationStep.Finished
          )

          if (hasFinishedInterview) {
            return reply.status(409).send({
              message:
                'Você já finalizou uma entrevista para esta vaga anteriormente.',
              jobId,
              companyId,
            })
          }
        }

        // Buscar idioma da vaga usando o caminho correto da subcoleção
        let jobLanguage: string | null = null
        if (jobId && companyId) {
          try {
            const job = await conversationService.getJob(companyId, jobId)
            jobLanguage = (job as PostJob | null)?.language ?? null
          } catch (error) {
            console.error('Erro ao buscar idioma da vaga:', error)
          }
        }

        return reply.status(200).send({
          id: phone,
          phone: phone,
          step: 'start_interview',
          email: null,
          password: null,
          interviewId: null,
          jobId,
          companyId,
          currentQuestionId: null,
          lastMessage: '',
          status: 'active',
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          language: jobLanguage,
        })
      } catch (error) {
        throw new BadRequestError((error as Error)?.message || String(error))
      }
    }
  )
}
