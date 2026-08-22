import { z } from 'zod'
import { CountryMapping } from '@/http/constants/interview-filters'
import {
  jobCareerLevelEnum,
  jobCategoriesEnum,
  jobEducationLevelEnum,
  jobInterviewTypeEnum,
  jobLanguageEnum,
  jobStatusEnum,
} from '@/http/constants/job-filters'
import { paginationSchema } from './common-schemas'

const structuredRequirementSchema = z.object({
  id: z.string(),
  label: z.string(),
  skill: z.string().nullish(),
  weight: z.number(),
  required: z.boolean(),
})

export const jobSortByEnum = z.enum(['default', 'name', 'createdAt'])
export const jobSortDirEnum = z.enum(['asc', 'desc'])

export const jobsQuerySchema = z.object({
  page: z.string().default('1').transform(Number),
  /**
   * Ordenação server-side. `default` = prioridade primeiro, depois mais
   * recentes (comportamento histórico). Campos do próprio job apenas —
   * ordenar por contagem de candidatos exigiria carregar entrevistas de
   * TODAS as vagas, não só da página.
   */
  sortBy: jobSortByEnum.default('default').describe('Sort field: default (priority+recent), name, createdAt'),
  sortDir: jobSortDirEnum.default('desc').describe('Sort direction: asc or desc'),
  limit: z.string().default('10').transform(Number),
  find: z.string().optional(),
  cursor: z.string().optional(), // Cursor para paginação (timestamp ISO)
  status: jobStatusEnum
    .default('all')
    .describe('Status filter: all, active, or inactive'),
  interviewType: z
    .string()
    .default('all')
    .describe(
      'Interview types filter. Multiple values can be separated by comma. Available types: all, evaluation, interview, emotional, exitJob'
    )
    .transform((val) => {
      const decodedVal = decodeURIComponent(val)
      const types = decodedVal.split(',').filter(Boolean)
      return types.every((type) =>
        jobInterviewTypeEnum.options.includes(type as any)
      )
        ? types
        : ['all']
    }),
  showArchived: z
    .string()
    .default('false')
    .describe('Show archived jobs')
    .transform((val) => val === 'true'),
  priority: z
    .enum(['all', 'true', 'false'])
    .default('all')
    .describe('Priority filter: all, true (only priority), false (only non-priority)'),
  language: jobLanguageEnum
    .default('all')
    .describe('Language filter: pt, en, es, fr, or it'),
  segment: jobCategoriesEnum.default('all').describe('Job segment filter'),
  level: jobCareerLevelEnum.default('all').describe('Career level filter'),
  education: jobEducationLevelEnum
    .default('all')
    .describe('Education level filter'),
  country: z
    .string()
    .default('all')
    .describe('Country filter (accepts both English and Portuguese names)')
    .transform((val) => {
      if (val === 'all') {
        return val
      }
      const normalizedVal = val.toLowerCase()
      return (
        CountryMapping[normalizedVal as keyof typeof CountryMapping] ||
        normalizedVal
      )
    }),
  state: z.string().default('all').describe('State filter (e.g., PR, SP, RJ)'),
  city: z.string().default('all').describe('City filter'),
  candidatesLimit: z
    .string()
    .default('50')
    .transform(Number)
    .describe('Maximum number of candidates per job for performance'),
  creatorId: z.string().optional().describe('Filter by creator ID'),
  creatorEmail: z.string().optional().describe('Filter by creator email'),
})

export const jobsResponseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      jobName: z.string(),
      identifier: z.string().nullish(),
      uid: z.string().nullable(),
      timeCreated: z.date().nullable(),
      closingDate: z.date().nullable(),
      infoJobs: z.string().nullable(),
      stopped: z.boolean().nullish(),
      archived: z.boolean().nullish(),
      priority: z.boolean().nullish(),
      language: z.string().nullish(),
      structuredRequirements: z.array(structuredRequirementSchema).nullish(),
      jobCategories: z.string().nullish(),
      /** Vaga listada na careers page pública (badge Público/Privado no ats). */
      public: z.boolean().nullish(),
      carrerLevel: z.string().nullish(),
      educationalRequiements: z.array(z.string()).nullish(),
      typeInterview: z.string().nullish(),
      address: z
        .object({
          country: z.string().nullish(),
          state: z.string().nullish(),
          city: z.string().nullish(),
        })
        .nullish(),
      usersApplied: z.array(z.record(z.string(), z.unknown())),
      totalCandidates: z.number(),
      /** Candidatos por etapa (candidateStatus normalizado → contagem). */
      stageCounts: z.record(z.string(), z.number()),
      /** Tempo médio parado em cada etapa, em dias — a "trilha" da vaga. */
      stageDays: z.record(z.string(), z.number()),
      /** Anti-ghosting (TOS-026): régua de resposta em horas + desde quando está irregular. */
      antiGhostingEnabled: z.boolean().nullish(),
      feedbackSlaHours: z.number().nullish(),
      slaIrregularSince: z.date().nullish(),
      /** Ghost job (V2-604): intenção declarada + pausa automática por inatividade. */
      hiringIntent: z.string().nullish(),
      freshnessSlaDays: z.number().nullish(),
      creatorId: z.string().nullish(),
      creatorName: z.string().nullish(),
      creatorEmail: z.string().nullish(),
    })
  ),
  pagination: paginationSchema,
  nextCursor: z.string().nullable(),
})
