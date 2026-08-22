import type { FastifyInstance } from 'fastify'
import { UnauthorizedError } from '@coploy/shared/errors'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { generateRetroEmailHtml } from '@/lib/email-templates/retro-email-template'

import { postmarkClient } from '@/lib/postmark-client'
import type { Collaborator, Company, CompanyInterview, PostJob } from '@coploy/domain'
import type { Nps } from '@coploy/domain'
import { NotFoundError } from '@coploy/shared/errors'
import { createAuth } from '../middlewares/auth'
import { createDashboardService } from '@/lib/services/dashboard-service'

// Response schema for retro data
const retroResponseSchema = z.object({
  companyName: z.string(),
  companyLogo: z.string().nullable(),
  year: z.number(),
  totalJobs: z.number(),
  totalInterviews: z.number(),
  averageScore: z.number(),
  topJobs: z.array(
    z.object({
      name: z.string(),
      interviews: z.number(),
    })
  ),
  // NPS data
  nps: z.object({
    totalResponses: z.number(),
    npsScore: z.number(),
    averageRating: z.number(),
    promoters: z.number(),
    neutrals: z.number(),
    detractors: z.number(),
  }),
  // Extras
  totalMinutesInterviewed: z.number(),
  busiestMonth: z
    .object({
      month: z.string(),
      interviews: z.number(),
    })
    .nullable(),
  // Video retrospectiva
  videoUrl: z.string().nullable(),
  // Email info (only when sendEmail=true)
  emailSent: z
    .object({
      success: z.boolean(),
      recipientCount: z.number(),
      recipients: z.array(z.string()),
    })
    .optional(),
})

export function getRetro(app: FastifyInstance) {
  const dashboardService = createDashboardService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get(
      '/dashboard/retro/:year/:companyId',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['dashboard'],
          security: [{ bearerAuth: [] }],
          summary: 'Get annual retrospective data for a company',
          description:
            'Retorna dados consolidados do ano para gerar o vídeo de retrospectiva personalizado. Se sendEmail=true, envia email de retrospectiva para os collaborators com accessLevel=editor.',
          params: z.object({
            year: z.string().transform(Number),
            companyId: z.string(),
          }),
          querystring: z.object({
            sendEmail: z
              .enum(['true', 'false'])
              .default('false')
              .transform((v) => v === 'true'),
          }),
          response: {
            200: retroResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { company } = await request.getUserMembership()
        const { year, companyId } = request.params as {
          year: number
          companyId: string
        }
        // companyId vem do path: sem esta checagem qualquer pessoa lia a
        // retrospectiva de outra empresa só sabendo o id
        if (companyId !== company.id) {
          throw new UnauthorizedError('Company mismatch')
        }

        const { sendEmail } = request.query as { sendEmail: boolean }
        const companyData = await dashboardService.getCompany(
          companyId
        ) as Company | null

        if (!companyData) {
          throw new NotFoundError('Company not found')
        }

        // Define date range for the entire year
        const startOfYear = new Date(year, 0, 1)
        const endOfYear = new Date(
          year,
          11,
          31,
          23,
          59,
          59,
          999
        )

        // Fetch all jobs created in the year
        const jobs = await dashboardService.listJobs(
          companyData.id,
          {
            filters: [
              {
                field: 'timeCreated',
                operator: '>=',
                value: startOfYear,
              },
              {
                field: 'timeCreated',
                operator: '<=',
                value: endOfYear,
              },
            ],
          }
        ) as PostJob[]

        // Fetch all finished interviews in the year
        const interviews =
          await dashboardService.listCompanyInterviews(
            companyData.id,
            {
              filters: [
                {
                  field: 'date',
                  operator: '>=',
                  value: startOfYear,
                },
                {
                  field: 'date',
                  operator: '<=',
                  value: endOfYear,
                },
                {
                  field: 'finished',
                  operator: '==',
                  value: true,
                },
              ],
              orderByField: 'date',
              orderDirection: 'desc',
            }
          ) as CompanyInterview[]

        const totalInterviews = interviews.length

        // Calculate average score from interviews with valid scores
        const validScores = interviews
          .map((i) => {
            const score =
              typeof i.score === 'string' ? Number(i.score) : i.score
            return Number.isNaN(score) ? null : score
          })
          .filter((s): s is number => s != null && s > 0)

        const averageScore =
          validScores.length > 0
            ? Math.round(
                (validScores.reduce((a, b) => a + b, 0) / validScores.length) *
                  10
              ) / 10
            : 0

        // Group interviews by job name and get top 3
        const jobCounts = new Map<string, number>()
        for (const interview of interviews) {
          if (interview.jobName) {
            const currentCount = jobCounts.get(interview.jobName) || 0
            jobCounts.set(interview.jobName, currentCount + 1)
          }
        }

        const topJobs = Array.from(jobCounts.entries())
          .map(([name, count]) => ({ name, interviews: count }))
          .sort((a, b) => b.interviews - a.interviews)
          .slice(0, 3)

        // Fetch NPS data for the year
        const npsData = await dashboardService.listNps(
          companyData.id,
          {
            filters: [
              {
                field: 'createdAt',
                operator: '>=',
                value: startOfYear,
              },
              {
                field: 'createdAt',
                operator: '<=',
                value: endOfYear,
              },
            ],
          }
        ) as Nps[]

        // Calculate NPS metrics (escala 1-5)
        // NPS escala 1-5: Promoters 4-5 | Neutrals 3 | Detractors 1-2
        const npsResponses = npsData.length
        const promoters = npsData.filter((nps) => nps.score >= 4).length
        const neutrals = npsData.filter((nps) => nps.score === 3).length
        const detractors = npsData.filter((nps) => nps.score <= 2).length

        const npsScore =
          npsResponses > 0
            ? Math.round(((promoters - detractors) / npsResponses) * 100)
            : 0

        const npsAverageRating =
          npsResponses > 0
            ? Math.round(
                (npsData.reduce((sum, nps) => sum + nps.score, 0) /
                  npsResponses) *
                  10
              ) / 10
            : 0

        // Calculate total minutes interviewed (assuming ~15 min per interview)
        const totalMinutesInterviewed = totalInterviews * 15

        // Find busiest month
        const monthCounts = new Map<number, number>()
        const monthNames = [
          'Janeiro',
          'Fevereiro',
          'Março',
          'Abril',
          'Maio',
          'Junho',
          'Julho',
          'Agosto',
          'Setembro',
          'Outubro',
          'Novembro',
          'Dezembro',
        ]

        for (const interview of interviews) {
          if (interview.date) {
            const date =
              interview.date instanceof Date
                ? interview.date
                : new Date(
                    (interview.date as unknown as { seconds: number }).seconds *
                      1000
                  )
            const month = date.getMonth()
            const currentCount = monthCounts.get(month) || 0
            monthCounts.set(month, currentCount + 1)
          }
        }

        let busiestMonth: { month: string; interviews: number } | null = null
        let maxInterviews = 0
        for (const [month, count] of monthCounts.entries()) {
          if (count > maxInterviews) {
            maxInterviews = count
            busiestMonth = { month: monthNames[month], interviews: count }
          }
        }

        // Buscar URL do vídeo de retrospectiva
        const videoUrl = companyData.retro2025 || null

        // Preparar resposta base
        const responseData = {
          companyName: companyData.companyName ?? '',
          companyLogo: companyData.companLogo || null,
          year,
          totalJobs: jobs.length,
          totalInterviews,
          averageScore,
          topJobs,
          nps: {
            totalResponses: npsResponses,
            npsScore,
            averageRating: npsAverageRating,
            promoters,
            neutrals,
            detractors,
          },
          totalMinutesInterviewed,
          busiestMonth,
          videoUrl,
        }

        // Se sendEmail=true, buscar collaborators e enviar email
        if (sendEmail) {
          // Buscar collaborators com accessLevel = editor
          const collaborators =
            await dashboardService.listCollaborators(
              companyData.id,
              {
                filters: [
                  {
                    field: 'accessLevel',
                    operator: '==',
                    value: 'editor',
                  },
                  {
                    field: 'status',
                    operator: '==',
                    value: true,
                  },
                ],
              }
            ) as unknown as Collaborator[]

          // Filtrar apenas emails válidos
          const recipientEmails = collaborators
            .map((c) => c.email)
            .filter((email): email is string => !!email && email.includes('@'))

          if (recipientEmails.length > 0) {
            // Gerar HTML do email
            const emailHtml = generateRetroEmailHtml({
              companyName: companyData.companyName ?? '',
              totalInterviews,
              totalJobs: jobs.length,
              npsScore,
              videoUrl,
            })
            // Enviar emails em lote
            const emailsToSend = recipientEmails.map((email) => ({
              from: 'suporte@coploy.io',
              to: email,
              subject: `🎉 Retrospectiva 2025 - ${companyData.companyName} | Coploy`,
              htmlBody: emailHtml,
              tag: 'retro-2025',
            }))

            try {
              await postmarkClient.sendBatchEmail(emailsToSend)

              return reply.send({
                ...responseData,
                emailSent: {
                  success: true,
                  recipientCount: recipientEmails.length,
                  recipients: recipientEmails,
                },
              } as unknown as typeof responseData & { companyName: string })
            } catch {
              return reply.send({
                ...responseData,
                emailSent: {
                  success: false,
                  recipientCount: 0,
                  recipients: [],
                },
              } as unknown as typeof responseData & { companyName: string })
            }
          }

          return reply.send({
            ...responseData,
            emailSent: {
              success: false,
              recipientCount: 0,
              recipients: [],
            },
          } as unknown as typeof responseData & { companyName: string })
        }

        return reply.send(responseData as unknown as typeof responseData & { companyName: string })
      }
    )
}
