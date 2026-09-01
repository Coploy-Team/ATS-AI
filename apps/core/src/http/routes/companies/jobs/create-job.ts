import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { recordDashboardAudit } from '@/http/plugins/dashboard-audit'
import { createAuth } from '@/http/routes/middlewares/auth'
import { BadRequestError } from '@coploy/shared/errors'
import { createJobsService } from '@/lib/services/jobs-service'
import { createJobRequisitionService } from '@/lib/services/job-requisition-service'
import { createOrgService } from '@/lib/services/org-service'

const jobQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  audioUrl: z.string().optional().default(''),
  finish: z.boolean().default(false),
  levelQ: z.string().optional(),
  peso: z.number().optional(),
  skills: z.string().optional(),
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

const evaluationSchema = z.object({
  language: z.string().optional().nullable().default('pt-BR'),
})

const addressSchema = z.object({
  state: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
})

export function createJob(app: FastifyInstance) {
  const jobsService = createJobsService(app.infra)
  const requisitions = createJobRequisitionService(app.infra)
  const org = createOrgService(app.infra)
  app
    .withTypeProvider<ZodTypeProvider>()
    .register(createAuth(app.infra))
    .post(
      '/companies/jobs',
      {
        schema: {
          'x-surface': 'empresa',
          tags: ['jobs'],
          security: [{ bearerAuth: [] }],
          summary: 'Create a new job post',
          body: z.object({
            identifier: z.string().optional(),
            /**
             * Requisição que autoriza esta vaga.
             *
             * Opcional por retrocompatibilidade: empresa sem a flag
             * `jobRequisition` segue criando vaga em um clique. Com a flag
             * ligada, a vaga só nasce a partir de uma requisição aprovada — que
             * é como funciona em empresa onde headcount tem dono.
             */
            requisitionId: z.string().optional(),
            /** Área/departamento/centro de custo dono da vaga (V2-502). */
            orgUnitId: z.string().nullable().optional(),
            /** Valores dos campos que a empresa definiu, por `key`. */
            customFieldValues: z
              .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
              .optional(),
            jobName: z.string(),
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
            public: z.boolean().default(true),
            priority: z.boolean().optional().default(false),
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
            typeInterview: z.enum([
              'evaluation',
              'interview',
              'emotional',
              'exitJob',
              'whatsapp',
            ]),
            interviewMode: z.enum(['video', 'voice', 'whatsapp']).optional().default('video'),
            evaluateLanguage: z.boolean().optional().default(false),
            /**
             * Enviar o retorno automático ao candidato ao fim da entrevista.
             *
             * Sem default: ausente significa "não decidiu", e o orchestrator
             * trata ausente como ENVIA. Gravar `true` aqui seria escrever uma
             * decisão que ninguém tomou.
             */
            sendCandidateFeedback: z.boolean().optional(),
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
            requiresPreviousExperience: z.boolean().optional().default(false),
            limitedJobVacancy: z.boolean().default(false),
            limitNumberJobVacancies: z.string().optional(),
            infoJobsBool: z.boolean().default(false),
            infoJobsId: z.string().optional(),
            infoJobsWelcomeMessage: z.string().optional(),
            infoJobsFinishMessage: z.string().optional(),
            infoJobsColor: z.string().optional(),
            infoJobsCompanyLogo: z.string().optional(),
            infoJobsCompanyBanner: z.string().optional(),
            uid_notification_message: z.string().optional(),
            evaluation: evaluationSchema
              .optional()
              .nullable()
              .default({ language: 'pt-BR' }),
          }),
          response: {
            201: z.object({
              jobId: z.string(),
            }),
          },
        },
      },
      async (request) => {
        const userId = await request.getCurrentUser()
        const { company } = await request.getUserMembership()
        const { requisitionId, ...jobBody } = request.body

        /*
         * O ciclo da requisição fechava no vazio: `linkJob` existia no service e
         * NINGUÉM o chamava, então "aprovada" era um selo sem consequência —
         * aprovar não autorizava nada e a mesma requisição podia virar vaga
         * quantas vezes quisessem. A validação acontece ANTES de criar: recusar
         * depois deixaria uma vaga órfã para trás.
         */
        /*
         * Lido por request, sem cache: a flag é POR EMPRESA, e guardá-la no
         * escopo da rota faria a configuração do primeiro tenant valer para
         * todos os outros — vazamento de política entre clientes.
         */
        if (!requisitionId && (await requisitions.requiresRequisition(company.id))) {
          throw new BadRequestError(
            'Esta empresa exige uma requisição aprovada para abrir vaga',
          )
        }
        if (requisitionId) {
          await requisitions.assertUsable({ companyId: company.id, requisitionId })
        }

        /*
         * Estrutura e campos próprios validados ANTES de criar, pelo mesmo
         * motivo da requisição: recusar depois deixaria vaga meio criada, e a
         * mensagem de erro precisa dizer o que corrigir enquanto o formulário
         * ainda está na tela.
         */
        if (jobBody.orgUnitId) {
          await org.assertOrgUnit(company.id, jobBody.orgUnitId)
        }
        if (jobBody.customFieldValues) {
          await org.validateValues({
            companyId: company.id,
            entity: 'job',
            values: jobBody.customFieldValues,
          })
        }

        const { jobId, companyId } = await jobsService.createJob(userId, jobBody)

        if (requisitionId) {
          // já validada acima; falhar aqui deixaria a vaga criada e a requisição
          // aberta, então o erro sobe e o operador vê o que aconteceu
          await requisitions.linkJob({ companyId: company.id, requisitionId, jobId })
        }
        await recordDashboardAudit(app.infra, {
          action: 'job.created',
          userId,
          companyId,
          resource: 'job',
          resourceId: jobId,
          metadata: { jobName: request.body.jobName },
        })
        return { jobId }
      }
    )
}
