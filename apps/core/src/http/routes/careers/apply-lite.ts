import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { CANDIDATE_SOURCES } from '@coploy/domain'

import { createJobApplicationService } from '@/lib/services/job-application-service'
import { cpfInputSchema } from '@/schemas/candidate-profile-schema'
import { authDreamJobs } from '../middlewares/authDreamJobs'

const MAX_KNOCKOUT_KEYS = 40
const MAX_KNOCKOUT_PAYLOAD_CHARS = 10_000

const httpOrHttpsUrl = z
	.string()
	.url()
	.refine(
		(value) => {
			try {
				const protocol = new URL(value).protocol
				return protocol === 'http:' || protocol === 'https:'
			} catch {
				return false
			}
		},
		{ message: 'resumeUrl must be http or https' },
	)

const knockoutAnswersSchema = z
	.record(z.string().max(128), z.unknown())
	.refine((obj) => Object.keys(obj).length <= MAX_KNOCKOUT_KEYS, {
		message: `knockoutAnswers must have at most ${MAX_KNOCKOUT_KEYS} keys`,
	})
	.refine((obj) => JSON.stringify(obj).length <= MAX_KNOCKOUT_PAYLOAD_CHARS, {
		message: `knockoutAnswers payload too large`,
	})

const applyLiteBodySchema = z.object({
	name: z.string().min(2).max(200).optional(),
	email: z.string().email().optional(),
	phone: z.string().min(8).max(40).optional(),
	cpf: cpfInputSchema.optional(),
	resumeUrl: httpOrHttpsUrl.optional(),
	notes: z.string().max(2000).optional(),
	knockoutAnswers: knockoutAnswersSchema.optional(),
	/**
	 * Origem da candidatura (V2-601). Vem do cliente porque só ele sabe por
	 * qual porta a pessoa entrou; o service valida contra a taxonomia e cai em
	 * `careers` — esta rota É a página de carreiras.
	 */
	source: z.enum(CANDIDATE_SOURCES).optional(),
	sourceDetail: z.string().max(200).optional(),
	/**
	 * Prova de entrevista verificada (OTS 0.2) — o JWS compact inteiro.
	 * Opcional; falha de verificação nunca bloqueia a candidatura.
	 */
	otsAttestationJws: z.string().min(20).max(20_000).optional(),
})

const applyLiteResponseSchema = z.object({
	jobAppliedId: z.string(),
	companyId: z.string(),
	jobId: z.string(),
	created: z.boolean(),
	appliedWithoutInterview: z.literal(true),
	candidateStatus: z.string(),
	action: z.enum(['continue_interview', 'rejected']),
	interviewUrlPath: z.string(),
	rejectionReasonCode: z.string().nullable(),
	rejectionReasonLabel: z.string().nullable(),
	rejectionEvidence: z.string().nullable(),
	knockoutPassed: z.boolean().nullable(),
	otsAttestation: z
		.object({ accepted: z.boolean(), reason: z.string().nullable() })
		.nullable(),
})

/**
 * Apply leve (TOS-020) — registra candidatura sem mídia sob `/careers`.
 * Autenticado (mesmo gate do knockout): precisa de userId pra JobApplied.
 * Feature flag `applyLite` é checada só no service (`isApplyLiteAllowed`).
 */
export function applyLiteRoutes(app: FastifyInstance) {
	const jobApplicationService = createJobApplicationService(app.infra)

	app
		.withTypeProvider<ZodTypeProvider>()
		.register(authDreamJobs)
		.post(
			'/careers/:companyId/jobs/:jobId/apply',
			{
				schema: {
					'x-surface': 'candidato',
					tags: ['careers'],
					security: [{ bearerAuth: [] }],
					summary: 'Apply lite — create application without interview media',
					description:
						'Creates (or reuses) a JobApplied without media. Idempotent with the ' +
						'orchestrator interview session lazy-create: same user+job = one application. ' +
						'Unavailable when the tenant has not enabled apply lite (404).',
					params: z.object({
						companyId: z.string().min(1),
						jobId: z.string().min(1),
					}),
					body: applyLiteBodySchema,
					response: {
						200: applyLiteResponseSchema,
						404: z.object({ message: z.string() }),
					},
				},
			},
			async (request, reply) => {
				const candidateUserId = await request.getCurrentUser()
				const result = await jobApplicationService.applyLite({
					companyId: request.params.companyId,
					jobId: request.params.jobId,
					candidateUserId,
					...request.body,
				})
				return reply.status(200).send(result)
			},
		)
}
