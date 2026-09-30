import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { DEFAULT_CANDIDATE_RETENTION_DAYS } from '@coploy/domain'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createCompanyService } from '@/lib/services/company-service'
import { createLgpdService } from '@/lib/services/lgpd-service'

/**
 * Política de retenção e anonimização pela empresa (V2-701).
 *
 * A empresa é controladora: pode definir por quanto tempo guarda e pode
 * anonimizar. **Não** pode exportar dado de titular nem revogar consentimento
 * em nome dele — isso vive no lado do candidato.
 */
export function retentionRoutes(app: FastifyInstance) {
	const companyService = createCompanyService(app.infra)
	const lgpd = createLgpdService(app.infra)
	const policySchema = z.object({
		/** `null` = não anonimiza automaticamente. */
		candidateRetentionDays: z.number().int().min(30).max(3650).nullable().optional(),
		talentPoolConsentDays: z.number().int().min(30).max(3650).nullable().optional(),
		policyVersion: z.string().max(40).nullable().optional(),
	})

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/settings/privacy/retention',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Política de retenção da empresa',
					response: {
						200: policySchema.extend({ defaultDays: z.number() }),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const doc = (await app.infra.companyRepository.getCompany(company.id)) as {
					retentionPolicy?: Record<string, unknown> | null
				} | null
				return {
					candidateRetentionDays:
						(doc?.retentionPolicy?.candidateRetentionDays as number | null) ?? null,
					talentPoolConsentDays:
						(doc?.retentionPolicy?.talentPoolConsentDays as number | null) ?? null,
					policyVersion: (doc?.retentionPolicy?.policyVersion as string | null) ?? null,
					defaultDays: DEFAULT_CANDIDATE_RETENTION_DAYS,
				}
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.patch(
			'/settings/privacy/retention',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Define a política de retenção',
					body: policySchema,
					response: { 200: z.object({ ok: z.boolean() }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				await companyService.updateCompany(company.id, {
					retentionPolicy: { ...request.body, updatedAt: new Date() },
				} as never)
				return { ok: true }
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.post(
			'/settings/privacy/anonymize',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['settings'],
					security: [{ bearerAuth: [] }],
					summary: 'Anonimiza um candidato a pedido dele (obrigação do controlador)',
					body: z.object({ userId: z.string(), confirm: z.literal(true) }),
					response: {
						200: z.object({
							jobsApplied: z.number(),
							interviews: z.number(),
							profileRemoved: z.boolean(),
							userRedacted: z.boolean(),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const actor = await request.getCurrentUser().catch(() => null)
				return lgpd.anonymize({
					userId: request.body.userId,
					companyId: company.id,
					requestedBy: actor ?? 'company_admin',
				})
			},
		)
}
