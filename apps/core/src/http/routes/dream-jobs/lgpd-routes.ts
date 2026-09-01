import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { CONSENT_PURPOSES } from '@coploy/domain'

import { authDreamJobs } from '@/http/routes/middlewares/authDreamJobs'
import { createLgpdService } from '@/lib/services/lgpd-service'
import { createOtsExportService } from '@/lib/services/ots-export-service'

/**
 * Direitos do titular (LGPD Art. 18) — V2-701.
 *
 * Mora no lado do CANDIDATO, não no da empresa: quem exerce esses direitos é a
 * pessoa. A empresa tem a rota de anonimização (obrigação dela como
 * controladora), mas não tem como pedir exportação nem revogar consentimento em
 * nome de ninguém.
 */
export function lgpdRoutes(app: FastifyInstance) {
	const service = createLgpdService(app.infra)
	const ots = createOtsExportService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/dream-jobs/privacy/consents',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Consentimentos do titular (vigentes e revogados)',
					response: {
						200: z.object({
							consents: z.array(
								z.object({
									id: z.string(),
									purpose: z.string(),
									granted: z.boolean(),
									companyId: z.string().nullable().optional(),
									grantedAt: z.any().nullable().optional(),
									expiresAt: z.any().nullable().optional(),
									revokedAt: z.any().nullable().optional(),
									policyVersion: z.string().nullable().optional(),
								}),
							),
						}),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				return { consents: await service.listConsents(userId) }
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post(
			'/dream-jobs/privacy/consents',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Registra consentimento com finalidade e prazo',
					body: z.object({
						purpose: z.enum(CONSENT_PURPOSES),
						companyId: z.string().nullable().optional(),
						/** Sem prazo o consentimento não se sustenta na lei. */
						expiresAt: z.string().datetime().nullable().optional(),
						policyVersion: z.string().max(40).nullable().optional(),
						source: z.string().max(40).nullable().optional(),
					}),
					response: { 200: z.object({ id: z.string() }) },
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				const { expiresAt, ...rest } = request.body
				const record = await service.grantConsent({
					userId,
					...rest,
					expiresAt: expiresAt ? new Date(expiresAt) : null,
				})
				return { id: record.id }
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.delete(
			'/dream-jobs/privacy/consents/:consentId',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Revoga um consentimento',
					params: z.object({ consentId: z.string() }),
					response: { 200: z.object({ ok: z.boolean() }) },
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				await service.revokeConsent({ userId, consentId: request.params.consentId })
				return { ok: true }
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/dream-jobs/privacy/export',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Exporta os dados do titular (LGPD Art. 18, V)',
					response: { 200: z.any() },
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				return service.exportUserData(userId)
			},
		)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post(
			'/dream-jobs/privacy/anonymize',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Anonimiza os dados do titular a pedido dele',
					description:
						'Remove o que identifica a pessoa e preserva o que é estatística do processo ' +
						'(nota, etapa, datas). Irreversível.',
					body: z.object({
						/*
						 * Confirmação explícita: é irreversível, e um POST disparado por
						 * engano apagaria o currículo inteiro de alguém.
						 */
						confirm: z.literal(true),
					}),
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
				const userId = await request.getCurrentUser()
				return service.anonymize({ userId, requestedBy: userId })
			},
		)

	/*
	 * Export OTS (V2-702). Separado do export LGPD de propósito: este é o
	 * perfil PORTÁTIL — formato aberto, feito para ser importado em outro
	 * lugar. O export LGPD é a prestação de contas do controlador, com
	 * candidaturas e trilha, que ninguém importa.
	 */
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.get(
			'/dream-jobs/profile/export',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['dream-jobs'],
					security: [{ bearerAuth: [] }],
					summary: 'Exporta o perfil no formato OTS 0.1 (portabilidade)',
					description:
						'Perfil portátil com proveniência (fieldSources). Atributos protegidos nunca ' +
						'saem, conforme OTS §2.4.4.',
					response: {
						200: z.object({
							otsVersion: z.string(),
							exportedAt: z.string(),
							profile: z.record(z.string(), z.any()),
						}),
					},
				},
			},
			async (request, reply) => {
				const userId = await request.getCurrentUser()
				const payload = await ots.exportProfile(userId)
				// anexo: o titular baixa o arquivo, não lê JSON na tela
				reply.header('Content-Disposition', 'attachment; filename="coploy-perfil-ots.json"')
				return payload
			},
		)
}
