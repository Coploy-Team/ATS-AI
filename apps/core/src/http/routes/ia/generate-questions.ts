import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { recordCoreAiUsage } from '@/lib/ai-usage'

export function generateQuestions(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .post(
      '/ia/questions',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['ia'],
          security: [{ bearerAuth: [] }],
          summary: 'Gera perguntas de entrevista baseadas nos dados da vaga',
          body: z.object({
            cargo: z.string({
              required_error: 'Cargo é obrigatório',
            }),
            nivel: z.string({
              required_error: 'Nível é obrigatório',
            }),
            descricao: z.string({
              required_error: 'Descrição é obrigatória',
            }),
            responsabilidades: z.string({
              required_error: 'Responsabilidades são obrigatórias',
            }),
            requisitos: z.string({
              required_error: 'Requisitos são obrigatórios',
            }),
            criticas: z.string().optional(),
            adicionais: z.string().optional(),
            expectativa: z.string().optional(),
            numero: z.number().optional(),
            idioma: z.string({
              required_error: 'Requisitos são obrigatórios',
            }),
          }),
          response: {
            200: z.object({
              perguntas: z.array(z.string()),
            }),
            400: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request) => {
        try {
          const userId = await request.getCurrentUser()
          const membership = await request.getUserMembership()
          const body = request.body

          const accessToken = await request.getAccessToken()
          const engineUrl = env.ENGINE_URL ?? 'http://localhost:3334'

          const response = await axios.post<{
            perguntas: string[]
            model?: string
            provider?: 'openai' | 'minimax'
            usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
          }>(
            `${engineUrl}/job-description/generate-questions`,
            {
              cargo: body.cargo,
              nivel: body.nivel,
              descricao: body.descricao,
              responsabilidades: body.responsabilidades,
              requisitos: body.requisitos,
              criticas: body.criticas,
              adicionais: body.adicionais,
              expectativa: body.expectativa,
              numero: body.numero,
              idioma: body.idioma,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Request-Id': request.id,
              },
              timeout: 120_000,
            }
          )

          if (!response.data.perguntas?.length) {
            throw new BadRequestError('Nenhuma pergunta foi gerada')
          }

          recordCoreAiUsage({
            infra: app.infra,
            company: membership.company,
            userId,
            requestId: request.id,
            surface: 'job_generate_questions',
            model: response.data.model,
            provider: response.data.provider,
            usage: response.data.usage,
            metadata: {
              cargo: body.cargo,
              nivel: body.nivel,
              questionCount: response.data.perguntas.length,
            },
          })

          return {
            perguntas: response.data.perguntas,
          }
        } catch (error) {
          throw new BadRequestError(error as string)
        }
      }
    )
}
