import axios from 'axios'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '@/env'
import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createIaService } from '@/lib/services/ia-service'
import { createCreditsService } from '@/services/credits-service'
import type { PostJob } from '@coploy/domain'
import { recordCoreAiUsage } from '@/lib/ai-usage'

export function generateJobPostDescription(app: FastifyInstance) {
  const creditsService = createCreditsService(app.infra)
  const iaService = createIaService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .post(
      '/ia/generate-job-post-description',
      {
        config: {
          rateLimit: rateLimitConfigs.ia,
        },
        schema: {
          'x-surface': 'empresa',
          tags: ['ia'],
          security: [{ bearerAuth: [] }],
          summary:
            'Gera descrição completa da vaga para divulgação/compartilhamento',
          body: z.object({
            jobTitle: z.string(),
            jobDescription: z.string(),
            responsibilities: z.string(),
            companyDescription: z.string().optional(),
            contractType: z.string().optional(),
            benefits: z.string().optional(),
            salary: z.string().optional(),
            interviewUrl: z.string().url(),
            language: z.enum(['pt', 'en', 'it', 'es', 'fr']).default('pt'),
            postJobId: z.string().optional(),
          }),
          response: {
            200: z.object({
              generatedDescription: z.string(),
            }),
            400: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request) => {
        try {
          const { postJobId } = request.body
          const membership = await request.getUserMembership()
          const company = membership?.company
          const usedBy = await request.getCurrentUser()

          if (!company?.id) {
            throw new BadRequestError('Empresa não encontrada')
          }

          const companyTyped = company as unknown as { subscriptionPlan?: string | null; subscriptionDetails?: { plan?: string | null } | null }
          const plan =
            companyTyped.subscriptionPlan || companyTyped.subscriptionDetails?.plan || ''
          const isEnterprise = plan.toLowerCase() === 'enterprise'

          // Não-enterprise: verificar se já gerou e debitar crédito antes de chamar engine
          if (!isEnterprise) {
            if (!postJobId) {
              throw new BadRequestError(
                'postJobId é obrigatório para geração de descrição'
              )
            }

            // Verificar se já existe descrição gerada (persistência)
            const postJob = await iaService.getJob(
              company.id,
              postJobId,
            ) as PostJob | null
            if (postJob?.generatedJobDescription) {
              throw new BadRequestError(
                'Esta vaga já possui descrição gerada. Apenas edição do texto é permitida.'
              )
            }

            const result = await creditsService.consumeCredit({
              companyId: company.id,
              feature: 'job_description',
              companyOwner: company.id,
              userId: company.id,
              jobApplied: postJobId,
              postJobId,
              usedBy,
              ip: request.ip ?? null,
              userAgent: request.headers['user-agent'] ?? null,
            })

            if (result.alreadyUsed) {
              throw new BadRequestError(
                'Esta vaga já teve descrição gerada anteriormente. Apenas edição do texto é permitida.'
              )
            }
          }

          const accessToken = await request.getAccessToken()
          const engineUrl = env.ENGINE_URL || 'http://localhost:3334'

          const response = await axios.post<{
            generatedDescription: string
            model?: string
            provider?: 'openai' | 'minimax'
            usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
          }>(
            `${engineUrl}/job-post-description/generate`,
            {
              jobTitle: request.body.jobTitle,
              jobDescription: request.body.jobDescription,
              responsibilities: request.body.responsibilities,
              companyDescription: request.body.companyDescription,
              contractType: request.body.contractType,
              benefits: request.body.benefits,
              salary: request.body.salary,
              interviewUrl: request.body.interviewUrl,
              language: request.body.language,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Request-Id': request.id,
              },
              timeout: 120000, // 2 minutos
            }
          )

          recordCoreAiUsage({
            infra: app.infra,
            company,
            userId: usedBy,
            requestId: request.id,
            surface: 'job_generate_post_description',
            model: response.data.model,
            provider: response.data.provider,
            usage: response.data.usage,
            postJobId: postJobId ?? null,
            metadata: {
              jobTitle: request.body.jobTitle,
              language: request.body.language,
            },
          })

          return {
            generatedDescription: response.data.generatedDescription,
          }
        } catch (error) {
          console.error('Error calling engine:', error)

          if (error instanceof BadRequestError) {
            throw error
          }
          if (axios.isAxiosError(error)) {
            const message =
              error.response?.data?.message ||
              error.message ||
              'Erro ao comunicar com o engine'
            throw new BadRequestError(message)
          }

          throw new BadRequestError(
            'Erro desconhecido ao gerar descrição da vaga'
          )
        }
      }
    )
}
