import type { FastifyInstance } from 'fastify'
import { createOrgService } from '@/lib/services/org-service'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobsService } from '@/lib/services/jobs-service'

const jobQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
})

const additionalQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
})

const structuredRequirementSchema = z.object({
  id: z.string(),
  label: z.string(),
  skill: z.string().optional(),
  weight: z.number(),
  required: z.boolean(),
})

const addressSchema = z.object({
  state: z.string(),
  country: z.string(),
  city: z.string(),
})

export function updateJob(app: FastifyInstance) {
  const jobsService = createJobsService(app.infra)
  const org = createOrgService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .put(
      '/companies/jobs/:jobId',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Update a job post completely',
          params: z.object({
            jobId: z.string(),
          }),
          body: z.object({
            orgUnitId: z.string().nullable().optional(),
            customFieldValues: z
              .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
              .optional(),
            jobName: z.string(),
            jobDescription: z.string(),
            employmentType: z.string(),
            closingDate: z.string().transform((val) => {
              if (!val || val.trim() === '') {
                throw new Error('closingDate is required and cannot be empty')
              }
              const date = new Date(val)
              if (Number.isNaN(date.getTime())) {
                throw new Error(`Invalid date format: ${val}`)
              }
              return date
            }),
            jobQuestions: z.array(jobQuestionSchema),
            additionalQuestions: z.array(additionalQuestionSchema).optional(),
            public: z.boolean(),
            priority: z.boolean().default(false),
            jobHours: z.string(),
            address: addressSchema,
            educationalRequiements: z.array(z.string()),
            language: z.string(),
            carrerLevel: z.string(),
            jobResponsabilities: z.string(),
            jobRequirements: z.string(),
            benefits: z.string().nullish(),
            salary: z.string().nullish(),
            structuredRequirements: z.array(structuredRequirementSchema).optional(),
            jobCategories: z.string(),
            typeInterview: z.enum([
              'evaluation',
              'interview',
              'emotional',
              'exitJob',
              'whatsapp',
            ]),
            interviewMode: z.enum(['video', 'voice', 'whatsapp']).optional().default('video'),
            evaluateLanguage: z.boolean().default(false),
            jobModel: z.string(),
            limitedJobVacancy: z.boolean(),
            limitNumberJobVacancies: z.string().optional(),
            infoJobsBool: z.boolean(),
            stopped: z.boolean(),
            archived: z.boolean(),
            infoJobsId: z.string().optional(),
          }),
          response: {
            200: z.object({
              success: z.boolean(),
            }),
          },
        },
      },
      async (request) => {
        const { jobId } = request.params
        const userId = await request.getCurrentUser()
        /* mesma validação da criação: vínculo confere o dono, campos conferem o schema */
        if (request.body.orgUnitId) {
          const { company } = await request.getUserMembership()
          await org.assertOrgUnit(company.id, request.body.orgUnitId)
        }
        if (request.body.customFieldValues) {
          const { company } = await request.getUserMembership()
          await org.validateValues({
            companyId: company.id,
            entity: 'job',
            values: request.body.customFieldValues,
          })
        }
        await jobsService.updateJob(userId, jobId, request.body)
        return { success: true }
      }
    )
}
