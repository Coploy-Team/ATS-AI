import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createConversationContextSchema } from '@/schemas/conversation-context-schema'
import type { ConversationContext } from '@/types/conversation-context'
import { ConversationStep } from '@/types/conversation-context'
import { BadRequestError } from '@coploy/shared/errors'
import { apiKeyAuthMiddleware } from '@/http/routes/middlewares/api-key-auth'
import { createConversationService } from '@/lib/services/conversation-service'

export function createConversationContext(app: FastifyInstance) {
  const conversationService = createConversationService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(apiKeyAuthMiddleware)
    .post(
    '/conversation-context',
    {
      schema: {
        tags: ['conversation'],
        summary: 'Create conversation context for new user',
        description:
          'Rota interna (canal WhatsApp). Requer header `x-api-key` com a CORE_API_KEY.',
        body: z.any(),
        response: {
          201: z.object({
            id: z.string(),
            phone: z.string(),
            step: z.string(),
            email: z.string().nullable(),
            password: z.string().nullable(),
            interviewId: z.string().nullable(),
            jobId: z.string().nullable(),
            companyId: z.string().nullable(),
            currentQuestionId: z.string().nullable(),
            lastMessage: z.string(),
            status: z.string(),
            retryCount: z.number(),
            maxRetries: z.number(),
            message: z.string(),
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
      if (!request.validateApiKey) {
        throw new BadRequestError('API Key middleware não configurado')
      }
      await request.validateApiKey()

      const body = request.body as Partial<ConversationContext> & {
        phone: string
      }

      const {
        phone,
        interviewId,
        jobId,
        companyId,
        step,
        lastMessage,
        status,
        retryCount,
        maxRetries,
        email,
        password,
        currentQuestionId,
      } = body

      try {
        if (!jobId)
          return reply.status(400).send({ message: 'jobId é obrigatório.' })

        const existingContext =
          await conversationService.getConversationContext(phone, jobId)

        if (existingContext) {
          const normalizedStep =
            typeof step === 'string'
              ? (step as ConversationStep)
              : undefined

          if (normalizedStep === ConversationStep.AskNextQuestion) {
            if (!currentQuestionId && !existingContext.currentQuestionId)
              throw new BadRequestError(
                'currentQuestionId é obrigatório para avançar para ask_next_question',
              )

            if (!lastMessage?.trim())
              throw new BadRequestError(
                'lastMessage com o texto da próxima pergunta é obrigatório para ask_next_question',
              )
          }

          const nextQuestionId =
            currentQuestionId !== undefined
              ? currentQuestionId
              : existingContext.currentQuestionId ?? null

          const updateData = {
            step: normalizedStep ?? existingContext.step,
            interviewId:
              interviewId !== undefined
                ? interviewId
                : existingContext.interviewId,
            companyId:
              companyId !== undefined ? companyId : existingContext.companyId,
            jobId: jobId || existingContext.jobId,
            lastMessage:
              lastMessage !== undefined
                ? lastMessage
                : existingContext.lastMessage,
            status:
              status !== undefined ? status : existingContext.status,
            retryCount:
              normalizedStep === ConversationStep.AskNextQuestion
                ? 0
                : retryCount ?? existingContext.retryCount,
            maxRetries: maxRetries ?? existingContext.maxRetries,
            email:
              email !== undefined
                ? email
                : existingContext.email ?? '',
            password:
              password !== undefined
                ? password
                : existingContext.password ?? null,
            currentQuestionId: nextQuestionId,
            updatedAt: new Date(),
          }
          const updatedContext = { ...existingContext, ...updateData }
          await conversationService.updateConversationContext(phone, jobId, updateData)

          return reply.status(201).send({
            id: jobId,
            phone,
            step: updatedContext.step ?? '',
            email: updatedContext.email ?? null,
            password: updatedContext.password ?? null,
            interviewId: updatedContext.interviewId ?? null,
            jobId: updatedContext.jobId ?? null,
            companyId: updatedContext.companyId ?? null,
            currentQuestionId: updatedContext.currentQuestionId ?? '',
            lastMessage: updatedContext.lastMessage ?? '',
            status: updatedContext.status ?? '',
            retryCount: updatedContext.retryCount ?? 0,
            maxRetries: updatedContext.maxRetries ?? 0,
            message: 'Contexto de conversa atualizado com sucesso',
          })
        }

        const created = {
          phone,
          step: (step as ConversationStep) || ConversationStep.StartInterview,
          email: email ?? '',
          password: password ?? null,
          interviewId: interviewId || null,
          jobId: jobId || null,
          companyId: companyId || null,
          currentQuestionId: currentQuestionId ?? null,
          lastMessage: lastMessage || '',
          status: status || 'active',
          retryCount: retryCount ?? 0,
          maxRetries: maxRetries ?? 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        await conversationService.createConversationContext(phone, jobId, created)

        return reply.status(201).send({
          id: jobId,
          phone,
          step: created.step,
          email: created.email,
          password: created.password,
          interviewId: created.interviewId,
          jobId: created.jobId,
          companyId: created.companyId,
          currentQuestionId: created.currentQuestionId,
          lastMessage: created.lastMessage,
          status: created.status,
          retryCount: created.retryCount,
          maxRetries: created.maxRetries,
          message: 'Contexto de conversa criado com sucesso',
        })
      } catch (error: any) {
        if (error instanceof BadRequestError) {
          throw error
        }
        throw new BadRequestError('Erro interno ao criar contexto de conversa')
      }
    }
  )
}
