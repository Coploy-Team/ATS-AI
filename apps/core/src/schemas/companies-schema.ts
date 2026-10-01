import { z } from 'zod'
import {
  COMPANY_FREE_DEFAULTS,
  COMPANY_PLANS,
} from '@/http/constants/company-free-constants'

export const CompaniesSchema = z
  .object({
    id: z.string(),
    companLogo: z
      .union([z.string().url(), z.literal('')])
      .optional()
      .nullable(),
    companyBio: z.string().optional().nullable(),
    companyCity: z.string().optional().nullable(),
    companyCountry: z.string().optional().nullable(),
    companyId: z.string(),
    companyName: z.string(),
    companySize: z.string().optional().nullable(),
    companyState: z.string().optional().nullable(),
    companyWebsite: z.string().optional().nullable(),
    stripeCustomerId: z.string().optional().nullable(),
    subscriptionPlan: z.string().optional().nullable(),
    subscriptionStatus: z
      .enum([
        'incomplete',
        'incomplete_expired',
        'trialing',
        'trial', // DEPRECATED: legacy value, será removido após migration completa em prod
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused',
      ])
      .optional()
      .nullable(),
    subscriptionId: z.string().optional().nullable(),
    currentPeriodEnd: z.number().optional().nullable(),
    trialEnd: z.number().optional().nullable(),
    plan: z.string().default(COMPANY_PLANS.free),
    subscriptionDetails: z.object({
      stripeCustomerId: z.string().optional(),
      plan: z.string().default(COMPANY_PLANS.free),
      status: z.string().default(COMPANY_FREE_DEFAULTS.STATUS),
      startAt: z.string().nullable().optional(),
      endAt: z.string().nullable().optional(),
    }),
    subscriptionCredits: z.object({
      creditsMonthly: z.number().default(0),
      creditsFixed: z.number().default(0),
      creditsCourtesy: z.number().default(0),
      creditsTotal: z.number().default(0),
    }),
    subscriptionTrial: z
      .object({
        courtesyCreditsGranted: z
          .number()
          .default(COMPANY_FREE_DEFAULTS.CREDITS_COURTESY),
        grantedAt: z.string().nullable().optional(),
        // Data de corte: entrevistas finalizadas ANTES deste timestamp são
        // expostas em cortesia (nota + conteúdo). Entrevistas em/após
        // exigem crédito normalmente. Sem campo → tudo bloqueado.
        startAt: z.string().nullable().optional(),
      })
      .optional(),
    whatsappBetaAccess: z.boolean().optional().nullable(), // Acesso ao grupo beta do WhatsApp
    features: z
      .object({
        useEngineProcessing: z.boolean().optional(), // Se true, usa coploy-engine para processar entrevistas
      })
      .optional(),
    /** Feature flags opt-in por tenant (admin-only). Default OFF. */
    featureFlags: z
      .object({
        antiGhosting: z.boolean().optional(),
        applyLite: z.boolean().optional(),
      })
      .optional()
      .nullable(),
  })
  .passthrough() // Permite campos extras para response (ex: apiKey)

// Tipo inferido do schema
export type Companies = z.infer<typeof CompaniesSchema>

/**
 * Campos que APENAS o sistema (webhooks Stripe, billing, admin) pode alterar.
 * Usados no service layer para filtrar dados antes de salvar.
 */
export const PROTECTED_COMPANY_FIELDS = [
  'id',
  'companLogo',
  'companyId',
  'plan',
  'subscriptionPlan',
  'subscriptionStatus',
  'subscriptionId',
  'subscriptionDetails',
  'subscriptionCredits',
  'subscriptionTrial',
  'stripeCustomerId',
  'currentPeriodEnd',
  'trialEnd',
  'whatsappBetaAccess',
  'features',
  'featureFlags',
] as const

/**
 * Remove campos protegidos de um objeto de company.
 * Deve ser chamado no service layer antes de salvar dados vindos do usuário.
 */
export function stripProtectedCompanyFields<T extends Record<string, unknown>>(data: T): Partial<T> {
  const stripped = { ...data }
  for (const field of PROTECTED_COMPANY_FIELDS) {
    delete stripped[field]
  }
  return stripped
}
