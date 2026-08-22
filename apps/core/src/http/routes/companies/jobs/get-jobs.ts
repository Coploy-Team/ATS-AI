import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { BadRequestError } from '@coploy/shared/errors'
import { createAuth } from '@/http/routes/middlewares/auth'

import { createJobsService } from '@/lib/services/jobs-service'
import { getCompanyIdFromUser } from '@/lib/user-company'
import { jobsQuerySchema, jobsResponseSchema } from '@/schemas/jobs-schema'
import type { UsersCompany } from '@coploy/domain'
import type { z } from 'zod'

export function getJobs(app: FastifyInstance) {
  const jobsService = createJobsService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .get(
      '/companies/jobs',
      {
        schema: {
          tags: ['jobs'],
          'x-surface': 'empresa',
          security: [{ bearerAuth: [] }],
          summary: 'Get all jobs with pagination and filters',
          description:
            'Get jobs with pagination and filters. For interview types, you can pass multiple values separated by comma (e.g. evaluation,interview). Candidates per job are limited by candidatesLimit parameter for performance.',
          querystring: jobsQuerySchema,
          response: {
            200: jobsResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const userId = await request.getCurrentUser()
        const user = (await jobsService.getUsersCompany(userId)) as UsersCompany | null

        if (!user) {
          throw new BadRequestError('User not found')
        }

        const {
          page,
          limit,
          find,
          cursor,
          status,
          interviewType,
          showArchived,
          language,
          segment,
          level,
          education,
          country,
          state,
          city,
          candidatesLimit,
          creatorId,
          priority,
          sortBy,
          sortDir,
        } = request.query

        const companyId = getCompanyIdFromUser(user as unknown as { company?: string | { id?: string; _id?: unknown } })
        if (!companyId) {
          throw new BadRequestError(
            'Usuário sem empresa vinculada. Faça login novamente ou entre em contato com o suporte.'
          )
        }


        // Processar jobs usando o service
        const { jobs: filteredJobs, nextCursor, totalFiltered } = await jobsService.processJobsQuery(
          companyId,
          {
            find,
            status,
            interviewType,
            showArchived,
            language,
            segment,
            level,
            education,
            country,
            state,
            city,
            candidatesLimit,
            cursor,
            creatorId,
            priority,
            sortBy,
            sortDir,
          },
          limit,
          page
        )

        // Total real quando o provider sabe contar (Firestore); senão, a
        // estimativa histórica ("pelo menos mais uma página").
        const hasRealTotal = typeof totalFiltered === 'number'
        const hasMore = hasRealTotal ? page * limit < totalFiltered : nextCursor !== null
        const total = hasRealTotal
          ? totalFiltered
          : hasMore
            ? page * limit + 1
            : (page - 1) * limit + filteredJobs.length

        return reply.send({
          jobs: filteredJobs,
          pagination: {
            total,
            page,
            totalPages: hasRealTotal
              ? Math.max(1, Math.ceil(total / limit))
              : hasMore
                ? page + 1
                : page,
            hasMore,
          },
          nextCursor,
        } as unknown as z.infer<typeof jobsResponseSchema>)
      }
    )
}
