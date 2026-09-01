import { REQUISITION_STATUSES } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobRequisitionService } from '@/lib/services/job-requisition-service'

const requisitionSchema = z.object({
	id: z.string(),
	companyId: z.string(),
	title: z.string(),
	area: z.string().nullable().optional(),
	reason: z.string().nullable().optional(),
	headcount: z.number(),
	salaryRangeMin: z.number().nullable().optional(),
	salaryRangeMax: z.number().nullable().optional(),
	currency: z.string().nullable().optional(),
	requestedByUserId: z.string(),
	requestedByName: z.string().nullable().optional(),
	/** Contratados na vaga ligada — derivado na leitura, nunca gravado. */
	hiredCount: z.number().nullable().optional(),
	/** hiredCount atingiu o headcount pedido. */
	fulfilled: z.boolean().optional(),
	status: z.enum(REQUISITION_STATUSES),
	decidedByUserId: z.string().nullable().optional(),
	decidedByName: z.string().nullable().optional(),
	decidedAt: z.union([z.string(), z.date()]).nullable().optional(),
	decisionNote: z.string().nullable().optional(),
	jobId: z.string().nullable().optional(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
})

/** Requisição de vaga com aprovação (V2-401). */
export function requisitionRoutes(app: FastifyInstance) {
	const service = createJobRequisitionService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/requisitions',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['requisitions'],
					security: [{ bearerAuth: [] }],
					summary: 'List job requisitions',
					querystring: z.object({ status: z.enum(REQUISITION_STATUSES).optional() }),
					response: {
						200: z.object({
							requisitions: z.array(requisitionSchema),
							/** A empresa exige requisição aprovada para publicar vaga? */
							required: z.boolean(),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const [{ requisitions }, required] = await Promise.all([
					service.listRequisitions({ companyId: company.id, status: request.query.status }),
					service.requiresRequisition(company.id),
				])
				return { requisitions, required }
			},
		)
		.post(
			'/companies/requisitions',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['requisitions'],
					security: [{ bearerAuth: [] }],
					summary: 'Request a new job opening',
					body: z.object({
						title: z.string().min(1).max(160),
						area: z.string().max(120).nullable().optional(),
						reason: z.string().max(1000).nullable().optional(),
						headcount: z.number().int().min(1).max(999).default(1),
						salaryRangeMin: z.number().int().nullable().optional(),
						salaryRangeMax: z.number().int().nullable().optional(),
						currency: z.string().max(8).nullable().optional(),
					}),
					response: { 201: z.object({ requisition: requisitionSchema }) },
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const requestedByUserId = await request.getCurrentUser()
				/*
				 * O membership NÃO carrega o usuário (só a empresa) — ler
				 * `user.display_name` dali gravava null desde sempre, e a tela
				 * nunca mostrava quem pediu a vaga (3º bug da mesma família).
				 */
				const requester = (await app.infra.userRepository
					.getUsersCompany(requestedByUserId)
					.catch(() => null)) as { display_name?: string | null } | null
				const requisition = await service.createRequisition({
					companyId: company.id,
					requestedByUserId,
					requestedByName: requester?.display_name ?? null,
					...request.body,
				})
				return reply.status(201).send({ requisition })
			},
		)
		.patch(
			'/companies/requisitions/:requisitionId',
			{
				// aprovar orçamento de headcount é decisão de quem administra a conta
				schema: {
					'x-surface': 'empresa',
					tags: ['requisitions'],
					security: [{ bearerAuth: [] }],
					summary: 'Approve or reject a job requisition',
					params: z.object({ requisitionId: z.string() }),
					body: z.object({
						decision: z.enum(['approved', 'rejected']),
						note: z.string().max(1000).nullable().optional(),
					}),
					response: { 200: z.object({ requisition: requisitionSchema }) },
				},
			},
			async (request) => {
				const { company, user } = (await request.getUserMembership()) as {
					company: { id: string }
					user?: { display_name?: string | null }
				}
				const decidedByUserId = await request.getCurrentUser()
				const requisition = await service.decide({
					companyId: company.id,
					requisitionId: request.params.requisitionId,
					decision: request.body.decision,
					decidedByUserId,
					decidedByName: user?.display_name ?? null,
					note: request.body.note,
				})
				return { requisition }
			},
		)
}
