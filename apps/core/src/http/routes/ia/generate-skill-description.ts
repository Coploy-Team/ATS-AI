import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'
import { createAuth } from '@/http/routes/middlewares/auth'
import { BadRequestError } from '@coploy/shared/errors'
import { recordCoreAiUsage } from '@/lib/ai-usage'

function sanitizeString(input: string | null | undefined): string {
  if (input === null || input === undefined) {
    return ''
  }
  const str = String(input)
  return str.replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{S}]/gu, '').trim()
}

export function generateSkillDescription(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .post(
      '/ia/skill-description',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['ia'],
          security: [{ bearerAuth: [] }],
          summary: 'Gera descrição de competências baseada nos dados da vaga',
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
            idioma: z.string({
              required_error: 'Idioma são obrigatórios',
            }),
          }),
          response: {
            200: z.object({
              competencias_criticas: z
                .string()
                .transform((val) => String(val))
                .nullable(),
              competencias_adicionais: z
                .string()
                .transform((val) => String(val))
                .nullable(),
              expectativa: z
                .string()
                .transform((val) => String(val))
                .nullable(),
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
          const {
            cargo,
            nivel,
            descricao,
            responsabilidades,
            requisitos,
            idioma,
          } = request.body

          const accessToken = await request.getAccessToken()
          const engineUrl = env.ENGINE_URL ?? 'http://localhost:3334'

          const response = await axios.post<{
            competencias_criticas: string
            competencias_adicionais: string
            expectativa: string
            model?: string
            provider?: 'openai' | 'minimax'
            usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
          }>(
            `${engineUrl}/job-description/generate-skill-description`,
            {
              cargo,
              nivel,
              descricao,
              responsabilidades,
              requisitos,
              idioma,
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

          recordCoreAiUsage({
            infra: app.infra,
            company: membership.company,
            userId,
            requestId: request.id,
            surface: 'job_generate_skills',
            model: response.data.model,
            provider: response.data.provider,
            usage: response.data.usage,
            metadata: { cargo, nivel, idioma },
          })

          return {
            competencias_criticas: sanitizeString(
              response.data.competencias_criticas
            ),
            competencias_adicionais: sanitizeString(
              response.data.competencias_adicionais
            ),
            expectativa: sanitizeString(response.data.expectativa),
          }
        } catch (error) {
          throw new BadRequestError(error as string)
        }
      }
    )
}
