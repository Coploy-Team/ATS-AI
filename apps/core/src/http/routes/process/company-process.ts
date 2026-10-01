import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { SCHEDULE_FORMATS } from '@coploy/domain'

import { createAuth } from '@/http/routes/middlewares/auth'
import { assertJobInScope } from '@/lib/access-scope'
import { createInterviewScheduleService } from '@/lib/services/interview-schedule-service'
import { createProcessFeedbackService, MANUAL_FEEDBACK_STAGES } from '@/lib/services/process-feedback-service'

import { feedbackSchema, scheduleSchema } from './schemas'

/**
 * OTS 0.3 do lado da empresa, na ficha do candidato: propor horários de
 * entrevista e mandar retorno. O talento responde pela área dele ou pelo
 * assistente conectado.
 */
export function companyProcess(app: FastifyInstance) {
	const schedules = createInterviewScheduleService(app.infra)
	const feedback = createProcessFeedbackService(app.infra)

	const params = z.object({ jobId: z.string(), candidateId: z.string() })
	const base = '/companies/jobs/:jobId/candidates/:candidateId'
	const common = { 'x-surface': 'empresa' as const, tags: ['jobs'], security: [{ bearerAuth: [] }] }

	async function actor(request: { getCurrentUser: () => Promise<string> }) {
		const actorId = await request.getCurrentUser().catch(() => null)
		const user = actorId
			? ((await Promise.resolve(app.infra.userRepository.getUsersCompany(actorId)).catch(() => null)) as { display_name?: string | null } | null)
			: null
		return { actorId, actorName: user?.display_name ?? null }
	}

	const typed = app.withTypeProvider<ZodTypeProvider>().register(createAuth(app.infra))

	typed.get(
		`${base}/schedules`,
		{
			schema: {
				...common,
				summary: 'List interview time proposals for this candidate (OTS 0.3)',
				params,
				response: { 200: z.object({ schedules: z.array(scheduleSchema) }) },
			},
		},
		async (request) => {
			const { company } = await request.getUserMembership()
			await assertJobInScope(app.infra, request, company.id, request.params.jobId)
			return { schedules: await schedules.listForCandidate({ companyId: company.id, ...request.params }) }
		},
	)

	typed.post(
		`${base}/schedules`,
		{
			schema: {
				...common,
				summary: 'Propose interview times to the candidate (OTS 0.3 schedule_interview)',
				description:
					'Replaces any open or confirmed proposal for this application. The meeting link is stored now and shown ' +
					'to the candidate only after they confirm a slot.',
				params,
				body: z.object({
					format: z.enum(SCHEDULE_FORMATS),
					durationMinutes: z.number().int().min(5).max(480),
					timezone: z.string().min(1),
					slots: z.array(z.object({ start: z.string().min(1) })).min(1).max(20),
					expiresAt: z.string().nullable().optional(),
					note: z.string().max(1000).nullable().optional(),
					joinDetails: z
						.object({
							meetingUrl: z.string().max(2000).nullable().optional(),
							address: z.string().max(500).nullable().optional(),
							instructions: z.string().max(1000).nullable().optional(),
						})
						.nullable()
						.optional(),
				}),
				response: { 201: scheduleSchema, 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) },
			},
		},
		async (request, reply) => {
			const { company } = await request.getUserMembership()
			await assertJobInScope(app.infra, request, company.id, request.params.jobId)
			const created = await schedules.propose({
				companyId: company.id,
				...request.params,
				...(await actor(request)),
				input: request.body,
			})
			return reply.status(201).send(created)
		},
	)

	typed.post(
		`${base}/schedules/:scheduleId/cancel`,
		{
			schema: {
				...common,
				summary: 'Cancel an interview time proposal',
				params: params.extend({ scheduleId: z.string() }),
				response: { 200: scheduleSchema, 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) },
			},
		},
		async (request) => {
			const { company } = await request.getUserMembership()
			await assertJobInScope(app.infra, request, company.id, request.params.jobId)
			return schedules.cancel({ companyId: company.id, ...request.params })
		},
	)

	typed.get(
		`${base}/feedback`,
		{
			schema: {
				...common,
				summary: 'List the process feedback sent to this candidate (OTS 0.3)',
				params,
				response: { 200: z.object({ feedback: z.array(feedbackSchema) }) },
			},
		},
		async (request) => {
			const { company } = await request.getUserMembership()
			await assertJobInScope(app.infra, request, company.id, request.params.jobId)
			return { feedback: await feedback.listForCandidate({ companyId: company.id, ...request.params }) }
		},
	)

	typed.post(
		`${base}/feedback`,
		{
			schema: {
				...common,
				summary: 'Send process feedback to the candidate (OTS 0.3 submit_feedback)',
				description:
					'Human text is required. Closing the process (not selected) is done by rejecting on the board, which ' +
					'records the feedback automatically.',
				params,
				body: z.object({
					stage: z.enum(MANUAL_FEEDBACK_STAGES as [string, ...string[]]),
					message: z.string().min(1).max(4000),
					nextStep: z.string().max(1000).nullable().optional(),
				}),
				response: { 201: feedbackSchema, 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) },
			},
		},
		async (request, reply) => {
			const { company } = await request.getUserMembership()
			await assertJobInScope(app.infra, request, company.id, request.params.jobId)
			const sent = await feedback.send({
				companyId: company.id,
				...request.params,
				...(await actor(request)),
				stage: request.body.stage as (typeof MANUAL_FEEDBACK_STAGES)[number],
				message: request.body.message,
				nextStep: request.body.nextStep ?? null,
			})
			return reply.status(201).send(sent)
		},
	)
}
