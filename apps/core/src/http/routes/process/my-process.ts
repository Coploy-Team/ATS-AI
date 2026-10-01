import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { Company, PostJob } from '@coploy/domain'

import { createInterviewScheduleService } from '@/lib/services/interview-schedule-service'
import { createProcessFeedbackService } from '@/lib/services/process-feedback-service'
import { authDreamJobs } from '../middlewares/authDreamJobs'

import { myFeedback, mySchedule, scheduleResponseSchema } from './schemas'

/**
 * OTS 0.3 do lado do talento: as propostas de horário e os retornos dos
 * processos dele. É o que a área do candidato mostra e o que o MCP e o
 * binding REST repassam ao assistente.
 */
export function myProcess(app: FastifyInstance) {
	const schedules = createInterviewScheduleService(app.infra)
	const feedback = createProcessFeedbackService(app.infra)
	const common = { 'x-surface': 'candidato' as const, tags: ['interviews'], security: [{ bearerAuth: [] }] }

	/** Vaga e empresa pelo nome, uma leitura por par distinto. */
	async function namesFor(items: Array<{ companyId: string; jobId: string }>) {
		const companies = new Map<string, string | null>()
		const jobs = new Map<string, string | null>()
		await Promise.all(
			[...new Set(items.map((item) => item.companyId))].map(async (companyId) => {
				const company = (await Promise.resolve(app.infra.companyRepository.getCompany(companyId)).catch(() => null)) as Company | null
				companies.set(companyId, company?.companyName ?? null)
			}),
		)
		await Promise.all(
			[...new Set(items.map((item) => `${item.companyId}:${item.jobId}`))].map(async (key) => {
				const [companyId, jobId] = key.split(':')
				const job = (await Promise.resolve(app.infra.jobRepository.getJob(companyId, jobId)).catch(() => null)) as PostJob | null
				jobs.set(key, job?.jobName ?? null)
			}),
		)
		return (item: { companyId: string; jobId: string }) => ({
			companyName: companies.get(item.companyId) ?? null,
			jobName: jobs.get(`${item.companyId}:${item.jobId}`) ?? null,
		})
	}

	const typed = app.withTypeProvider<ZodTypeProvider>().register(authDreamJobs)

	typed.get(
		'/interviews/mine/schedules',
		{
			schema: {
				...common,
				summary: "List the authenticated candidate's interview time proposals (OTS 0.3)",
				response: { 200: z.object({ schedules: z.array(mySchedule) }) },
			},
		},
		async (request) => {
			const userId = await request.getCurrentUser()
			const items = await schedules.listMine(userId)
			const names = await namesFor(items)
			return {
				schedules: items.map(({ proposedBy: _by, proposedByName: _name, candidateId: _card, userId: _user, ...item }) => ({
					...item,
					...names(item),
				})),
			}
		},
	)

	typed.post(
		'/interviews/mine/schedules/:scheduleId/respond',
		{
			schema: {
				...common,
				summary: 'Confirm one proposed slot or decline the proposal (OTS 0.3 ScheduleResponse)',
				description:
					'Confirming is idempotent and only accepts a slot the company proposed, while the proposal is open. ' +
					'`via` tells whether the candidate answered in the candidate area or through a connected assistant.',
				params: z.object({ scheduleId: z.string() }),
				querystring: z.object({ via: z.enum(['candidate_area', 'agent']).default('candidate_area') }),
				body: scheduleResponseSchema,
				response: { 200: mySchedule, 400: z.object({ message: z.string() }), 404: z.object({ message: z.string() }) },
			},
		},
		async (request) => {
			const userId = await request.getCurrentUser()
			const updated = await schedules.respond({
				userId,
				scheduleId: request.params.scheduleId,
				response: request.body,
				via: request.query.via,
			})
			const names = await namesFor([updated])
			const { proposedBy: _by, proposedByName: _name, candidateId: _card, userId: _user, ...item } = updated
			return { ...item, ...names(item) }
		},
	)

	typed.get(
		'/interviews/mine/feedback',
		{
			schema: {
				...common,
				summary: "List the process feedback the authenticated candidate received (OTS 0.3)",
				querystring: z.object({ jobAppliedId: z.string().optional() }),
				response: { 200: z.object({ feedback: z.array(myFeedback) }) },
			},
		},
		async (request) => {
			const userId = await request.getCurrentUser()
			const all = await feedback.listMine(userId)
			const items = request.query.jobAppliedId ? all.filter((item) => item.jobAppliedId === request.query.jobAppliedId) : all
			const names = await namesFor(items)
			return {
				feedback: items.map(({ sentBy: _by, sentByName: _name, source: _source, candidateId: _card, userId: _user, ...item }) => ({
					...item,
					...names(item),
				})),
			}
		},
	)
}
