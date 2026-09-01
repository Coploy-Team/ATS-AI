import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { HIRING_INTENTS } from '@coploy/domain'

import { createCareersService } from '@/lib/services/careers-service'

const brandingSchema = z.object({
	companyName: z.string().nullable(),
	logoUrl: z.string().nullable(),
	bannerUrl: z.string().nullable(),
	bannerPosition: z.number().nullable(),
	primaryColor: z.string().nullable(),
	textColor: z.string().nullable(),
	socialLinks: z.array(z.object({ kind: z.string(), url: z.string() })),
	/** "Sobre a empresa" (Markdown) da configuração do portal. */
	about: z.string().nullable(),
	/** Vídeo institucional (URL YouTube/Vimeo). */
	videoUrl: z.string().nullable(),
})

const jobSummarySchema = z.object({
	jobId: z.string(),
	companyId: z.string(),
	title: z.string(),
	location: z.string().nullable(),
	level: z.string().nullable(),
	workModality: z.string().nullable(),
	employmentType: z.string().nullable(),
	salary: z.string().nullable(),
	postedAt: z.string().nullable(),
	closingDate: z.string().nullable(),
	applyUrl: z.string(),
	interviewUrl: z.string(),
	/** Motor presente + perguntas cadastradas — só então a tela oferece entrevista. */
	interviewReady: z.boolean(),
	// Safe to expose anonymously: product-facing signal for the careers UI
	// (short form vs go straight to interview). Internal flag name `applyLite` stays private.
	shortApplicationForm: z.boolean(),
	/**
	 * Intenção declarada de contratação (V2-604). `null` quando a vaga é
	 * anterior ao campo — a tela não afirma nada nesse caso, porque silêncio é
	 * honesto e um default seria mentira.
	 */
	hiringIntent: z.enum(HIRING_INTENTS).nullable(),
	/**
	 * Selo "vaga verificada": a empresa cumpre o SLA de resposta E a vaga tem
	 * movimentação recente. É consequência de comportamento, não de plano
	 * contratado — não existe como upgrade.
	 */
	verified: z.boolean(),
})

const jobDetailsSchema = jobSummarySchema.extend({
	description: z.string().nullable(),
	requirements: z.string().nullable(),
	responsibilities: z.string().nullable(),
	benefits: z.string().nullable(),
	companyDescription: z.string().nullable(),
	contractType: z.string().nullable(),
	jobHours: z.string().nullable(),
	language: z.string().nullable(),
	knockoutQuestions: z.array(
		z.object({
			id: z.string(),
			question: z.string(),
			type: z.string(),
			options: z.array(z.string()).nullable(),
		}),
	),
	/**
	 * Etapas do processo (a régua real da vaga, sem os destinos offTrack).
	 * Padrão de mercado: o candidato vê o caminho antes de entrar nele.
	 */
	processStages: z.array(
		z.object({
			id: z.string(),
			order: z.number(),
			label: z.string(),
			labelEn: z.string(),
		}),
	),
})

export function careersRoutes(app: FastifyInstance) {
	const careersService = createCareersService(app.infra)

	app.withTypeProvider<ZodTypeProvider>().get(
		'/careers/:companyId/jobs',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['careers'],
				summary: 'List public careers jobs by company',
				params: z.object({
					companyId: z.string().min(1),
				}),
				querystring: z.object({
					limit: z.coerce.number().int().min(1).max(50).optional(),
				}),
				response: {
					200: z.object({
						branding: brandingSchema,
						jobs: z.array(jobSummarySchema),
						totalAvailable: z.number(),
					}),
					404: z.object({ message: z.string() }),
				},
			},
		},
		async (request, reply) => {
			const result = await careersService.listJobs(request.params.companyId, request.query)
			if (!result) {
				return reply.status(404).send({ message: 'Company not found' })
			}
			return reply.status(200).send(result)
		},
	)

	app.withTypeProvider<ZodTypeProvider>().get(
		'/careers/:companyId/jobs/:jobId',
		{
			schema: {
				'x-surface': 'publico',
				tags: ['careers'],
				summary: 'Get public careers job details',
				params: z.object({
					companyId: z.string().min(1),
					jobId: z.string().min(1),
				}),
				response: {
					200: z.object({
						branding: brandingSchema,
						job: jobDetailsSchema,
					}),
					404: z.object({ message: z.string() }),
				},
			},
		},
		async (request, reply) => {
			const result = await careersService.getJob(request.params.companyId, request.params.jobId)
			if (!result) {
				return reply.status(404).send({ message: 'Job not found' })
			}
			return reply.status(200).send(result)
		},
	)
}
