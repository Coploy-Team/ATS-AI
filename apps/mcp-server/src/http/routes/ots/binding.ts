import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { env } from '@/env'
import { verifyToken, type AccessTokenPayload } from '@/lib/oauth/jwt'
import {
	toOtsJob,
	toOtsJobDetails,
	toOtsProcessEntry,
	toOtsProcessFeedback,
	toOtsProfile,
	toOtsSchedule,
} from '@/lib/ots-binding'
import { createCandidateAuthService } from '@/lib/services/candidate-auth-service'
import { createCandidateInterviewsService } from '@/lib/services/candidate-interviews-service'
import { createPublicJobsService } from '@/lib/services/public-jobs-service'
import * as coreClient from '@/lib/core-client'

/**
 * Binding REST do OTS 0.1  — `/ots/v0.1/*`.
 *
 * O contrato deste caminho é `packages/ots-contract/0.1/binding/openapi.json`,
 * GERADO dos schemas normativos; as respostas passam pelos mapeadores de
 * allowlist de `lib/ots-binding.ts` e a suíte (`ots-conformance rest <url>`)
 * valida um provedor vivo contra os schemas.
 *
 * Auth: mesmo OAuth 2.1 do canal MCP — o access token é do TALENTO, e as
 * superfícies dele (profile, process-entries) exigem Bearer. Descoberta de
 * vaga é pública, como no MCP.
 */

function extractUid(request: FastifyRequest): string | null {
	const header = request.headers.authorization
	if (!header?.startsWith('Bearer ')) return null
	const claims = verifyToken<AccessTokenPayload>(
		header.slice('Bearer '.length),
		env.MCP_OAUTH_SIGNING_SECRET,
		'access',
	)
	return claims?.uid ?? null
}

function unauthorized(reply: FastifyReply) {
	// RFC 9728: o WWW-Authenticate aponta a descoberta OAuth — mesma dança do /mcp
	return reply
		.status(401)
		.header(
			'www-authenticate',
			`Bearer resource_metadata="${env.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
		)
		.send({ error: 'unauthorized', message: 'Bearer access token required' })
}

export function otsBinding(app: FastifyInstance) {
	const publicJobsService = createPublicJobsService(app.infra)
	const interviewsService = createCandidateInterviewsService(app.infra)
	const candidateAuthService = createCandidateAuthService(app.infra)

	const typed = app.withTypeProvider<ZodTypeProvider>()

	typed.get(
		'/ots/v0.1/jobs',
		{
			schema: {
				querystring: z.object({
					query: z.string().optional(),
					language: z.enum(['pt-BR', 'en']).optional(),
					limit: z.coerce.number().int().min(1).max(25).default(10),
				}),
			},
		},
		async (request) => {
			const { query, language, limit } = request.query
			const result = await publicJobsService.searchJobs({ query, language, limit })
			return { jobs: result.jobs.map(toOtsJob), totalAvailable: result.totalAvailable }
		},
	)

	typed.get(
		'/ots/v0.1/jobs/:companyId/:jobId',
		{
			schema: {
				params: z.object({ companyId: z.string(), jobId: z.string() }),
			},
		},
		async (request, reply) => {
			const { companyId, jobId } = request.params
			const job = await publicJobsService.getJobDetails(companyId, jobId)
			// Privada, fechada ou inexistente: a MESMA resposta — lookup por ID não
			// pode confirmar que uma vaga privada existe.
			if (!job) return reply.status(404).send({ error: 'not_found' })
			return toOtsJobDetails(job)
		},
	)

	// Perfil portátil do talento autenticado. (Sem bloco `schema`: o app não
	// registra swagger, e FastifySchema puro rejeita tags/summary.)
	typed.get('/ots/v0.1/profile', async (request, reply) => {
		const uid = extractUid(request)
		if (!uid) return unauthorized(reply)
		const token = await candidateAuthService.mintUserIdToken(uid)
		const result = await coreClient.getCandidateProfile(token)
		return toOtsProfile(uid, result.ok ? result.data : null)
	})

	// Participações do talento em processos de empresas. A entrevista de perfil
	// fica FORA: não é participação em processo — é o currículo vivo, outra
	// superfície.
	typed.get('/ots/v0.1/process-entries', async (request, reply) => {
		const uid = extractUid(request)
		if (!uid) return unauthorized(reply)
		const result = await interviewsService.listMyInterviews(uid)
		return { entries: result.companyInterviews.map(toOtsProcessEntry) }
	})

	typed.post(
		'/ots/v0.1/process-entries',
		{
			schema: {
				body: z.object({ companyId: z.string().min(1), jobId: z.string().min(1) }),
			},
		},
		async (request, reply) => {
			const uid = extractUid(request)
			if (!uid) return unauthorized(reply)
			const { companyId, jobId } = request.body

			const session = await interviewsService.startInterview(uid, companyId, jobId)
			if (!session) return reply.status(404).send({ error: 'not_found' })

			// A sessão não devolve o id da participação — buscar na lista fecha o
			// contrato (ProcessEntry.id é obrigatório) com uma leitura a mais.
			const mine = await interviewsService.listMyInterviews(uid)
			const entry = mine.companyInterviews.find(
				(item) => item.jobId === jobId && item.companyId === companyId,
			)

			return reply.status(201).send({
				entry: entry
					? toOtsProcessEntry(entry)
					: // Corrida rara (projeção ainda não materializou): entrega o que a
						// sessão sabe, com id sintético estável por vaga.
						{
							id: `${companyId}:${jobId}`,
							jobId,
							companyId,
							jobName: session.jobName,
							companyName: session.companyName,
							companyLogo: null,
							status:
								session.status === 'finished'
									? ('completed' as const)
									: session.status === 'in_progress'
										? ('in_progress' as const)
										: ('pending' as const),
							startedAt: null,
							completedAt: null,
							feedback: null,
							rejectionExplanation: null,
							failedRequirementLabel: null,
							interview: {
								questionsAnswered: session.questionsAnswered,
								questionsTotal: session.questionsTotal,
								interviewUrl: session.interviewUrl,
							},
						},
			})
		},
	)

	// ─── OTS 0.3: agendamento e retorno ao talento ───────────────────
	typed.get('/ots/v0.3/schedules', async (request, reply) => {
		const uid = extractUid(request)
		if (!uid) return unauthorized(reply)
		const schedules = await interviewsService.listMySchedules(uid)
		return { schedules: schedules.map(toOtsSchedule) }
	})

	typed.post(
		'/ots/v0.3/schedules/:id/respond',
		{
			schema: {
				params: z.object({ id: z.string() }),
				body: z.discriminatedUnion('action', [
					z.object({ action: z.literal('confirm'), slotStart: z.string().min(1) }).strict(),
					z
						.object({
							action: z.literal('decline'),
							reason: z.enum(['no_slot_fits', 'not_interested', 'accepted_other_offer', 'other']),
							note: z.string().max(1000).nullable().optional(),
						})
						.strict(),
				]),
			},
		},
		async (request, reply) => {
			const uid = extractUid(request)
			if (!uid) return unauthorized(reply)
			const result = await interviewsService.respondToSchedule(uid, request.params.id, request.body)
			if (!result.ok) {
				const status = result.status === 404 ? 404 : result.status >= 400 && result.status < 500 ? 409 : 502
				return reply.status(status).send({ error: status === 404 ? 'not_found' : 'not_accepted', message: result.message })
			}
			return toOtsSchedule(result.data)
		},
	)

	typed.get(
		'/ots/v0.3/process-entries/:id/feedback',
		{ schema: { params: z.object({ id: z.string() }) } },
		async (request, reply) => {
			const uid = extractUid(request)
			if (!uid) return unauthorized(reply)
			const feedback = await interviewsService.listMyProcessFeedback(uid, request.params.id)
			return { feedback: feedback.map(toOtsProcessFeedback) }
		},
	)

}
