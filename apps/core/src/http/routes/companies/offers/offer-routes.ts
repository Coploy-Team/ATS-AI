import { OFFER_STATUSES } from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createOfferService } from '@/lib/services/offer-service'

const offerSchema = z.object({
	id: z.string(),
	companyId: z.string(),
	jobId: z.string(),
	candidateId: z.string(),
	salaryMinor: z.number(),
	currency: z.string(),
	contractType: z.string().nullable().optional(),
	startDate: z.union([z.string(), z.date()]).nullable().optional(),
	notes: z.string().nullable().optional(),
	status: z.enum(OFFER_STATUSES),
	sentAt: z.union([z.string(), z.date()]).nullable().optional(),
	respondedAt: z.union([z.string(), z.date()]).nullable().optional(),
	declineReason: z.string().nullable().optional(),
	createdByUserId: z.string(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
})

/** Oferta e contratação (V2-402 / V2-403) — o fim do funil. */
export function offerRoutes(app: FastifyInstance) {
	const service = createOfferService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/jobs/:jobId/candidates/:candidateId/offers',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['offers'],
					security: [{ bearerAuth: [] }],
					summary: 'List offers for a candidate',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					response: { 200: z.object({ offers: z.array(offerSchema) }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { jobId, candidateId } = request.params
				return service.listOffers({ companyId: company.id, jobId, candidateId })
			},
		)
		.post(
			'/companies/jobs/:jobId/candidates/:candidateId/offers',
			{
				// oferta compromete dinheiro: mesma régua de quem administra a conta
				schema: {
					'x-surface': 'empresa',
					tags: ['offers'],
					security: [{ bearerAuth: [] }],
					summary: 'Create an offer (draft)',
					params: z.object({ jobId: z.string(), candidateId: z.string() }),
					body: z.object({
						salaryMinor: z.number().int().positive(),
						currency: z.string().max(8).default('BRL'),
						contractType: z.string().max(60).nullable().optional(),
						startDate: z.string().nullable().optional(),
						notes: z.string().max(2000).nullable().optional(),
					}),
					response: { 201: z.object({ offer: offerSchema }) },
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const createdByUserId = await request.getCurrentUser()
				const { jobId, candidateId } = request.params
				const offer = await service.createOffer({
					companyId: company.id,
					jobId,
					candidateId,
					createdByUserId,
					...request.body,
				})
				return reply.status(201).send({ offer })
			},
		)
		.post(
			'/companies/offers/:offerId/send',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['offers'],
					security: [{ bearerAuth: [] }],
					summary: 'Send a draft offer',
					params: z.object({ offerId: z.string() }),
					response: { 200: z.object({ offer: offerSchema }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const authorId = await request.getCurrentUser().catch(() => null)
				const offer = await service.sendOffer({
					companyId: company.id,
					offerId: request.params.offerId,
					authorId,
				})
				return { offer }
			},
		)
		.patch(
			'/companies/offers/:offerId',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['offers'],
					security: [{ bearerAuth: [] }],
					summary: 'Register the candidate response or cancel the offer',
					params: z.object({ offerId: z.string() }),
					body: z.object({
						action: z.enum(['accepted', 'declined', 'cancelled']),
						declineReason: z.string().max(600).nullable().optional(),
					}),
					response: { 200: z.object({ ok: z.boolean() }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const { offerId } = request.params

				if (request.body.action === 'cancelled') {
					await service.cancelOffer({ companyId: company.id, offerId })
					return { ok: true }
				}

				await service.respondOffer({
					companyId: company.id,
					offerId,
					response: request.body.action,
					declineReason: request.body.declineReason,
				})
				return { ok: true }
			},
		)
}
