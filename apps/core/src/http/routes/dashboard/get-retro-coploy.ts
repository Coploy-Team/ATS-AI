import type { FastifyInstance } from 'fastify'
import { apiKeyAuthMiddleware } from '@/http/routes/middlewares/api-key-auth'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { Company, CompanyInterview, PostJob } from '@coploy/domain'
import type { Nps } from '@coploy/domain'
import { createDashboardService } from '@/lib/services/dashboard-service'

// Response schema for Coploy consolidated retro data
const retroCoploySchema = z.object({
  companies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      logo: z.string().nullable(),
    })
  ),
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
  topCompanies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      logo: z.string().nullable(),
      interviews: z.number(),
    })
  ),
  nps: z.object({
    totalResponses: z.number(),
    npsScore: z.number(),
    averageRating: z.number(),
    promoters: z.number(),
    neutrals: z.number(),
    detractors: z.number(),
  }),
  totalMinutesInterviewed: z.number(),
  busiestMonth: z
    .object({
      month: z.string(),
      interviews: z.number(),
    })
    .nullable(),
})

export function getRetroCoploy(app: FastifyInstance) {
  const dashboardService = createDashboardService(app.infra)

  app
    .withTypeProvider<ZodTypeProvider>()
    .register(apiKeyAuthMiddleware)
    .post(
      '/dashboard/retro/coploy/:year',
      {
        schema: {
          tags: ['dashboard'],
          summary: 'Get consolidated annual retrospective data for Coploy',
          description:
            'Rota INTERNA: agrega o ano de MÚLTIPLAS empresas para o vídeo de ' +
            'retrospectiva geral, então não é escopável por tenant. Requer ' +
            '`x-api-key` com a CORE_API_KEY.',
          params: z.object({
            year: z.string().transform(Number),
          }),
          body: z.object({
            companyIds: z
              .array(z.string())
              .min(1, 'Pelo menos uma empresa deve ser informada'),
          }),
          response: {
            200: retroCoploySchema,
          },
        },
      },
      async (request) => {
        const { year } = request.params as { year: number }
        const { companyIds } = request.body

        // Define date range for the entire year
        const startOfYear = new Date(year, 0, 1)
        const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999)

        // Arrays para consolidar dados
        let allJobs: PostJob[] = []
        let allInterviews: CompanyInterview[] = []
        let allNpsData: Nps[] = []
        const companiesInfo: Array<{
          id: string
          name: string
          logo: string | null
        }> = []
        const companyInterviewCounts = new Map<
          string,
          { id: string; name: string; logo: string | null; count: number }
        >()

        // Buscar dados de cada empresa
        for (const companyId of companyIds) {
          // Buscar informações da empresa
          const companyData = await dashboardService.getCompany(
            companyId
          ) as Company | null

          if (companyData) {
            const companyInfo = {
              id: companyData.id,
              name: companyData.companyName ?? '',
              logo: companyData.companLogo || null,
            }
            companiesInfo.push(companyInfo)

            // Buscar vagas da empresa
            const jobs = await dashboardService.listJobs(
              companyId,
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
            allJobs = [...allJobs, ...jobs]

            // Buscar entrevistas finalizadas
            const interviews =
              await dashboardService.listCompanyInterviews(
                companyId,
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
            allInterviews = [...allInterviews, ...interviews]

            // Contar entrevistas por empresa
            companyInterviewCounts.set(companyId, {
              id: companyData.id,
              name: companyData.companyName ?? '',
              logo: companyData.companLogo || null,
              count: interviews.length,
            })

            // Buscar dados de NPS
            const npsData = await dashboardService.listNps(
              companyId,
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
            allNpsData = [...allNpsData, ...npsData]
          }
        }

        // Calcular métricas consolidadas
        const totalInterviews = allInterviews.length

        // Calculate average score from interviews with valid scores
        const validScores = allInterviews
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
        for (const interview of allInterviews) {
          if (interview.jobName) {
            const currentCount = jobCounts.get(interview.jobName) || 0
            jobCounts.set(interview.jobName, currentCount + 1)
          }
        }

        const topJobs = Array.from(jobCounts.entries())
          .map(([name, count]) => ({ name, interviews: count }))
          .sort((a, b) => b.interviews - a.interviews)
          .slice(0, 3)

        // Top companies by interviews
        const topCompanies = Array.from(companyInterviewCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map((company) => ({
            id: company.id,
            name: company.name,
            logo: company.logo,
            interviews: company.count,
          }))

        // Calculate NPS metrics (escala 1-5)
        // NPS escala 1-5: Promoters 4-5 | Neutrals 3 | Detractors 1-2
        const npsResponses = allNpsData.length
        const promoters = allNpsData.filter((nps) => nps.score >= 4).length
        const neutrals = allNpsData.filter((nps) => nps.score === 3).length
        const detractors = allNpsData.filter((nps) => nps.score <= 2).length

        const npsScore =
          npsResponses > 0
            ? Math.round(((promoters - detractors) / npsResponses) * 100)
            : 0

        const npsAverageRating =
          npsResponses > 0
            ? Math.round(
                (allNpsData.reduce((sum, nps) => sum + nps.score, 0) /
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

        for (const interview of allInterviews) {
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

        return {
          companies: companiesInfo,
          year,
          totalJobs: allJobs.length,
          totalInterviews,
          averageScore,
          topJobs,
          topCompanies,
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
        }
      }
    )
}
