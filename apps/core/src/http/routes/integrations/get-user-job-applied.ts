import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BadRequestError } from '@coploy/shared/errors'
import { apiKeyAuthMiddleware } from '../middlewares/api-key-auth'
import { createIntegrationsService } from '@/lib/services/integrations-service'

const getUserJobAppliedParamsSchema = z.object({
  userId: z.string(),
  jobAppliedId: z.string(),
})

const ExitJobResultSchema = z
  .object({
    masked: z.boolean().optional(),
    executive_summary: z.string().nullable().optional(),
    resignation_reasons: z.array(z.string()).nullable().optional(),
    mapped_emotions: z.record(z.number()).nullable().optional(),
    negative_aspects: z.array(z.string()).nullable().optional(),
    positive_aspects: z.array(z.string()).nullable().optional(),
    contagion_risk: z.string().nullable().optional(),
    rehire_likelihood: z.string().nullable().optional(),
    improvement_actions: z.array(z.string()).nullable().optional(),
    extra_insights: z.any().nullable().optional(),
    reasons_over_time: z.any().nullable().optional(),
  })
  .nullable()

export function getIntegrationUserJobApplied(app: FastifyInstance) {
  const integrationsSvc = createIntegrationsService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(apiKeyAuthMiddleware)
    .get(
      '/integrations/users/:userId/jobs-applied/:jobAppliedId',
      {
        schema: {
          'x-surface': 'integracoes',
          tags: ['integrations'],
          summary: 'Get user job applied via API Key (Internal Integration)',
          description:
            'Retorna os dados completos de uma aplicação de vaga usando autenticação via API Key. Endpoint para uso interno/integração.',
          params: getUserJobAppliedParamsSchema,
          headers: z.object({
            'x-api-key': z.string().describe('API Key de integração'),
          }),
          response: {
            200: z.object({
              jobApplied: z.object({
                id: z.string(),
                appliedTime: z.date().nullable().optional(),
                companyOwner: z.string().nullable().optional(),
                finishedTime: z.date().nullable().optional(),
                dateSelect: z.date().nullable().optional(),
                userApplied: z.string().nullable().optional(),
                jobApplied: z.string().nullable().optional(),
                likes: z.array(z.record(z.string(), z.unknown())),
                totalLikes: z.number(),
                totalDislikes: z.number(),
                exitJobResult: ExitJobResultSchema,
                interview: z.any().nullable().optional(),
                interviewProgress: z.object({
                  isFinished: z.boolean(),
                  currentQuestion: z.number(),
                  totalQuestions: z.number(),
                  progress: z.string(),
                }),
              }),
              users: z.object({
                id: z.string(),
                uuid: z.string().nullable().optional(),
                created_time: z.date().nullable().optional(),
                display_name: z.string().nullable().optional(),
                email: z.string().nullable().optional(),
                phone_number: z.string().nullable().optional(),
                photo_url: z.string().nullable().optional(),
                language: z.string().nullable().optional(),
                countryOfResidence: z.string().nullable().optional(),
                countriesOfInterest: z.array(z.string()).nullable().optional(),
                professionalObjectives: z.string().nullable().optional(),
                resumeUrl: z.string().nullable().optional(),
                occupation: z.string().nullable().optional(),
                level: z.string().nullable().optional(),
                paymentDetails: z
                  .object({
                    stripeCustomerId: z.string().nullable().optional(),
                    paied: z.boolean().nullable().optional(),
                    paiedDate: z.date().nullable().optional(),
                    messageError: z.string().nullable().optional(),
                    dateError: z.date().nullable().optional(),
                  })
                  .nullable()
                  .optional(),
                dreamJobsInterview: z
                  .object({
                    jobId: z.string().nullable().optional(),
                    jobAppliedId: z.string().nullable().optional(),
                    createdAt: z.date().nullable().optional(),
                    status: z
                      .enum(['pending', 'in_progress', 'completed'])
                      .nullable()
                      .optional(),
                    completedAt: z.date().nullable().optional(),
                  })
                  .nullable()
                  .optional(),
              }),
              company: z.object({
                id: z.string(),
                companyName: z.string().nullable().optional(),
                companLogo: z.string().nullable().optional(),
                companyBio: z.string().nullable().optional(),
                companyCity: z.string().nullable().optional(),
                companyCountry: z.string().nullable().optional(),
                companyState: z.string().nullable().optional(),
                companySize: z.string().nullable().optional(),
                companyWebsite: z.string().nullable().optional(),
                segment: z.string().nullable().optional(),
                subscriptionStatus: z
                  .enum([
                    'incomplete',
                    'incomplete_expired',
                    'trialing',
                    'active',
                    'past_due',
                    'canceled',
                    'unpaid',
                    'paused',
                  ])
                  .nullable()
                  .optional(),
                headquartersCountries: z
                  .array(z.string())
                  .nullable()
                  .optional(),
              }),
            }),
            404: z.object({
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        try {
          const params = getUserJobAppliedParamsSchema.parse(request.params)
          const { userId, jobAppliedId } = params

          if (!request.validateApiKey) {
            throw new BadRequestError('API Key middleware não configurado')
          }
          await request.validateApiKey()

          const result = await integrationsSvc.getUserJobApplied(userId, jobAppliedId)

          if (!result.found) {
            const messages: Record<string, string> = {
              user: 'Usuário não encontrado',
              jobApplied: 'JobApplied não encontrado',
            }
            return reply.status(404).send({ message: messages[result.entity] ?? 'Not found' })
          }

          return reply.status(200).send({
            jobApplied: result.jobApplied as any,
            users: result.users as any,
            company: result.company as any,
          })
        } catch (error) {
          throw new BadRequestError(error as string)
        }
      }
    )
}
