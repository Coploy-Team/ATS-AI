import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createAuth } from '@/http/routes/middlewares/auth'
import type { UsersCompany } from '@coploy/domain'
import { engineJobDescriptionResponseSchema } from '@coploy/shared/contracts'
import { BadRequestError } from '@coploy/shared/errors'
import { createIaService } from '@/lib/services/ia-service'
import { recordCoreAiUsage } from '@/lib/ai-usage'

export function generateJobDescription(app: FastifyInstance) {
  const iaService = createIaService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .post(
      '/ia/job-description',
      {
        config: {
          rateLimit: rateLimitConfigs.ia,
        },
        schema: {
          'x-surface': 'empresa',
          tags: ['ia'],
          security: [{ bearerAuth: [] }],
          summary:
            'Gera descrição de vaga de trabalho baseada no nível e cargo',
          body: z.object({
            nivel: z.string({
              required_error: 'Nível da vaga é obrigatório',
            }),
            cargo: z.string({
              required_error: 'Cargo da vaga é obrigatório',
            }),
            idioma: z.string({
              required_error: 'Idioma da vaga é obrigatório',
            }),
          }),
          response: {
            200: engineJobDescriptionResponseSchema,
            400: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request) => {
        const userId = await request.getCurrentUser()
        const userData = await iaService.getUsersCompany(
          userId
        ) as UsersCompany | null
        if (!userData) {
          throw new BadRequestError('Usuário não encontrado')
        }
        const { nivel, cargo, idioma } = request.body

        const accessToken = await request.getAccessToken()
        const engineUrl = env.ENGINE_URL ?? 'http://localhost:3334'

        const membership = await request.getUserMembership()
        const response = await axios.post(
          `${engineUrl}/job-description/generate`,
          { nivel, cargo, idioma },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Request-Id': request.id,
            },
            timeout: 120_000,
          }
        )

        const parsed = engineJobDescriptionResponseSchema.safeParse(
          response.data
        )
        if (!parsed.success) {
          throw new BadRequestError('Contrato inválido retornado pelo AI Engine')
        }

        recordCoreAiUsage({
          infra: app.infra,
          company: membership.company,
          userId,
          requestId: request.id,
          surface: 'job_generate_description',
          model: parsed.data.model,
          provider: parsed.data.provider,
          usage: parsed.data.usage,
          metadata: { cargo, nivel, idioma },
        })

        return {
          descricao: parsed.data.descricao,
          responsabilidades: parsed.data.responsabilidades,
          requisitos: parsed.data.requisitos,
        }
      }
    )
}
