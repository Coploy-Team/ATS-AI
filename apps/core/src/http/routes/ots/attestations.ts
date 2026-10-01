import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { rateLimitConfigs } from '@/http/plugins/rate-limit'
import { createOtsAttestationService } from '@/lib/services/ots-attestation-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

/**
 * OTS 0.2 — attestation de entrevista verificada (spec-0.2).
 *
 * Quatro superfícies num assunto só:
 * - Emissão, listagem e revogação são do TALENTO (auth de candidato) — a
 *   emissão é ato explícito dele, com tier e validade escolhidos no ato.
 * - Status e JWKS são PÚBLICOS: é o que permite qualquer verificador checar
 *   revogação e assinatura sem pedir nada à Coploy (modelo certificado × CRL).
 *
 * Servidor sem chave configurada responde 503 na emissão com instrução —
 * nunca um documento sem assinatura. Status continua funcionando sempre.
 */

const attestationSummarySchema = z.object({
	jti: z.string(),
	tier: z.enum(['existence', 'summary', 'full']),
	jws: z.string(),
	statusUrl: z.string(),
	issuedAt: z.string(),
	expiresAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
	companyName: z.string().nullable(),
	jobTitle: z.string().nullable(),
})

const notConfiguredSchema = z.object({ message: z.string() })

export function otsAttestations(app: FastifyInstance) {
	const attestationService = createOtsAttestationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post(
			'/ots/attestations',
			{
				config: { rateLimit: rateLimitConfigs.auth },
				schema: {
					'x-surface': 'candidato',
					tags: ['ots'],
					security: [{ bearerAuth: [] }],
					summary: 'Emit a verified interview attestation (OTS 0.2)',
					description:
						'Explicit act of the talent over their own FINISHED interview. The tier decides ' +
						'how much is disclosed (existence | summary | full); validity defaults to 2 years. ' +
						'The document is a JWS (EdDSA) verifiable offline via {iss}/.well-known/ots/jwks.json.',
					body: z.object({
						jobAppliedId: z.string().min(1),
						tier: z.enum(['existence', 'summary', 'full']),
						expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
					}),
					response: {
						201: attestationSummarySchema,
						503: notConfiguredSchema,
					},
				},
			},
			async (request, reply) => {
				if (!attestationService.isConfigured()) {
					return reply.status(503).send({
						message:
							'OTS attestation emission is not configured (OTS_SIGNING_KEY / OTS_ISSUER_BASE_URL)',
					})
				}
				const userId = await request.getCurrentUser()
				const summary = await attestationService.emit(userId, request.body)
				return reply.status(201).send(summary)
			},
		)
		.get(
			'/ots/attestations',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['ots'],
					security: [{ bearerAuth: [] }],
					summary: "List the authenticated talent's own attestations",
					response: {
						200: z.object({ attestations: z.array(attestationSummarySchema) }),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				return { attestations: await attestationService.listMine(userId) }
			},
		)
		.post(
			'/ots/attestations/:jti/revoke',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['ots'],
					security: [{ bearerAuth: [] }],
					summary: 'Revoke an attestation (owner only, permanent)',
					params: z.object({ jti: z.string().min(8) }),
					response: {
						200: z.object({ jti: z.string(), status: z.literal('revoked') }),
					},
				},
			},
			async (request) => {
				const userId = await request.getCurrentUser()
				await attestationService.revoke(userId, request.params.jti)
				return { jti: request.params.jti, status: 'revoked' as const }
			},
		)

	// ── Superfície pública de verificação ───────────────────────────────────

	app.withTypeProvider<ZodTypeProvider>().get(
		'/ots/attestations/:jti/status',
		{
			config: { rateLimit: rateLimitConfigs.auth },
			schema: {
				'x-surface': 'publico',
				tags: ['ots'],
				summary: 'Attestation revocation status (public, no auth)',
				description:
					'The statusUrl inside every attestation. `unknown` never reveals whether the jti ' +
					'ever existed. Expiration is NOT checked here — verifiers read `exp` from the payload.',
				params: z.object({ jti: z.string().min(8) }),
				response: {
					200: z.object({
						jti: z.string(),
						status: z.enum(['valid', 'revoked', 'unknown']),
						revokedAt: z.string().nullable(),
						checkedAt: z.string(),
					}),
				},
			},
		},
		async (request) => attestationService.status(request.params.jti),
	)

	app.withTypeProvider<ZodTypeProvider>().get(
		'/.well-known/ots/jwks.json',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['ots'],
				summary: 'Issuer public keys (JWKS) for OTS attestation verification',
				description:
					'Only PUBLIC keys. Rotation keeps old kids published while signed documents live.',
				response: {
					200: z.object({ keys: z.array(z.record(z.string(), z.unknown())) }),
				},
			},
		},
		async () => attestationService.jwks(),
	)
}
