import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { HIRING_INTENTS } from '@coploy/domain'
import { HTTP_STATUS } from '@/http/constants'
import { jobScopeOfRequest } from '@/http/plugins/rbac'
import { BadRequestError } from '@coploy/shared/errors'
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

const jobSchema = z.object({
  identifier: z.string().optional(),
  jobName: z.string().optional(),
  /**
   * Publicar (ou voltar ao rascunho) sem depender de adivinhar booleano.
   *
   * O schema é allowlist: sem declarar, o Zod DESCARTA em silêncio e a
   * publicação passaria a depender de mandar `public: true` junto — que é
   * outra decisão (estar no portal), não a mesma.
   */
  status: z.enum(['draft', 'open', 'paused', 'closed']).optional(),
  /** Ligar/desligar a entrevista do Motor nesta vaga (aba Entrevista). */
  aiInterview: z.boolean().optional(),
  /**
   * Trocar o dono da vaga.
   *
   * Sem isso, vaga de recrutador que saiu da empresa fica invisível para os
   * outros recrutadores — o recorte é por `creatorId` e não havia como mexer
   * nele por tela nenhuma.
   */
  creatorId: z.string().optional(),
  orgUnitId: z.string().nullable().optional(),
  customFieldValues: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  jobDescription: z.string().optional(),
  employmentType: z.string().optional(),
  closingDate: z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') return undefined
      const date = new Date(val)
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${val}`)
      }
      return date
    }),
  jobQuestions: z.array(jobQuestionSchema).optional(),
  additionalQuestions: z.array(additionalQuestionSchema).optional(),
  public: z.boolean().optional(),
  jobHours: z.string().optional(),
  address: addressSchema.optional(),
  educationalRequiements: z.array(z.string()).optional(),
  language: z.string().optional(),
  carrerLevel: z.string().optional(),
  jobResponsabilities: z.string().optional(),
  jobRequirements: z.string().optional(),
  benefits: z.string().nullish(),
  salary: z.string().nullish(),
  structuredRequirements: z.array(structuredRequirementSchema).optional(),
  jobCategories: z.string().optional(),
  typeInterview: z
    .enum(['evaluation', 'interview', 'emotional', 'exitJob', 'whatsapp'])
    .optional(),
  interviewMode: z.enum(['video', 'voice', 'whatsapp']).optional(),
  evaluateLanguage: z.boolean().optional(),
  sendCandidateFeedback: z.boolean().optional(),
  acceptsCoployProfile: z.boolean().optional(),
  jobModel: z.string().optional(),
  contractType: z.string().optional(),
  screeningObjective: z.string().optional(),
  /**
   * Competências avaliadas pela entrevista (texto livre, uma por linha).
   *
   * Formato herdado da v1 e consumido pelo motor de avaliação — por isso
   * string e não lista: estruturar aqui quebraria a leitura do legado.
   */
  competencias_criticas: z.string().optional(),
  competencias_adicionais: z.string().optional(),
  expectativas: z.string().optional(),
  workModality: z.string().optional(),
  mainSkills: z.string().optional(),
  minimumAge: z.number().optional(),
  requiresPreviousExperience: z.boolean().optional(),
  limitedJobVacancy: z.boolean().optional(),
  limitNumberJobVacancies: z.string().optional(),
  infoJobsBool: z.boolean().optional(),
  stopped: z.boolean().optional(),
  // Régua de resposta ao candidato (TOS-026). Sem isto a tela de configuração
  // da vaga não teria onde gravar o SLA e o anti-ghosting seguiria só global.
  antiGhostingEnabled: z.boolean().optional(),
  feedbackSlaHours: z.number().int().min(1).max(720).nullable().optional(),
  /** Intenção de contratação declarada ao candidato (V2-604). */
  hiringIntent: z.enum(HIRING_INTENTS).nullable().optional(),
  /** Dias sem movimentação até a pausa automática. `null` = não pausar. */
  freshnessSlaDays: z.number().int().min(1).max(365).nullable().optional(),
  archived: z.boolean().optional(),
  priority: z.boolean().optional(),
  infoJobsId: z.string().optional(),
  infoJobs: z.any().optional(),
  uid_notification_message: z.union([z.string(), z.any()]).optional(),
  generatedJobDescription: z.string().optional(),
  jobDescriptionMetadata: z.object({
    companyDescription: z.string().optional(),
    contractType: z.string().optional(),
    benefits: z.string().optional(),
    salary: z.string().optional(),
    generatedAt: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    generatedBy: z.string().optional(),
  }).optional(),
})

export function patchJob(app: FastifyInstance) {
  const jobsService = createJobsService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .patch(
      '/companies/jobs/:jobId',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Update specific fields of a job post',
          params: z.object({
            jobId: z.string(),
          }),
          body: jobSchema.refine((data) => Object.keys(data).length > 0, {
            message: 'At least one field must be provided for update',
          }),
          response: {
            200: z.object({
              success: z.boolean(),
            }),
            400: z.object({
              error: z.string(),
              message: z.string(),
            }),
          },
        },
        errorHandler: (error, _request, reply) => {
          reply.status(HTTP_STATUS.BAD_REQUEST).send({
            error: 'Validation Error',
            message: error.message,
          })
        },
      },
      async (request) => {
        const { jobId } = request.params
        const userId = await request.getCurrentUser()

        /*
         * Trocar o dono é ato de gestão, não de operação.
         *
         * Quem só enxerga as próprias vagas (`recruiter`) não passa outra vaga
         * para si nem entrega a sua. O alcance dele já limitaria o alvo, mas a
         * permissão precisa ser DITA aqui — deduzi-la do alcance seria
         * segurança por acidente.
         */
        if (request.body.creatorId !== undefined) {
          const { scope } = jobScopeOfRequest(request)
          if (scope !== 'all') {
            throw new BadRequestError(
              'Sem permissão para trocar o responsável pela vaga',
            )
          }
        }

        await jobsService.patchJob(userId, jobId, request.body)
        return { success: true }
      }
    )
}
