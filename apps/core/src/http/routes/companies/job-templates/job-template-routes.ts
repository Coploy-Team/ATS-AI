import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createJobTemplateService } from '@/lib/services/job-template-service'

/**
 * O conteúdo reaproveitável.
 *
 * Declarado campo a campo, e não `passthrough`: o que entra no contrato é o que
 * o SDK tipa e a tela lê sem `as`. A allowlist de verdade — a que impede um
 * `creatorId` de vazar para dentro do modelo — vive em `jobTemplateContentFrom`,
 * no domínio, que é onde ela pertence.
 */
const contentSchema = z.object({
	jobDescription: z.string().nullish(),
	jobRequirements: z.string().nullish(),
	jobResponsabilities: z.string().nullish(),
	benefits: z.string().nullish(),
	carrerLevel: z.string().nullish(),
	jobCategories: z.string().nullish(),
	contractType: z.string().nullish(),
	jobModel: z.string().nullish(),
	jobHours: z.string().nullish(),
	language: z.string().nullish(),
	mainSkills: z.string().nullish(),
	competencias_criticas: z.string().nullish(),
	competencias_adicionais: z.string().nullish(),
	structuredRequirements: z
		.array(
			z.object({
				id: z.string(),
				label: z.string(),
				skill: z.string().optional(),
				weight: z.number(),
				required: z.boolean(),
			}),
		)
		.nullish(),
	jobQuestions: z
		.array(z.object({ id: z.string(), question: z.string() }))
		.nullish(),
	kanbanConfig: z
		.object({ columns: z.array(z.object({ id: z.string(), order: z.number() })) })
		.nullish(),
	/* A árvore de triagem é recursiva — descrevê-la aqui duplicaria o domínio. */
	knockoutTree: z.unknown().nullish(),
})

const templateSchema = contentSchema.extend({
	id: z.string(),
	companyId: z.string(),
	name: z.string(),
	jobName: z.string().nullish(),
	description: z.string().nullish(),
	active: z.boolean(),
	createdByName: z.string().nullish(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]).nullish(),
})

/** Modelos de vaga — o reaproveitamento entre vagas. */
export function jobTemplateRoutes(app: FastifyInstance) {
	const service = createJobTemplateService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/job-templates',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-templates'],
					security: [{ bearerAuth: [] }],
					summary: 'List job templates',
					response: { 200: z.object({ templates: z.array(templateSchema) }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return { templates: await service.listTemplates(company.id) }
			},
		)
		.get(
			'/companies/job-templates/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-templates'],
					security: [{ bearerAuth: [] }],
					summary: 'Get a job template',
					params: z.object({ id: z.string() }),
					response: { 200: z.object({ template: templateSchema }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return { template: await service.getTemplate(company.id, request.params.id) }
			},
		)
		.post(
			'/companies/job-templates',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-templates'],
					security: [{ bearerAuth: [] }],
					summary: 'Create a job template',
					body: contentSchema.extend({
						name: z.string().min(1),
						jobName: z.string().nullish(),
						description: z.string().nullish(),
						/**
						 * Criar a partir de uma vaga existente.
						 *
						 * É esta porta que faz o acervo nascer: quem já escreveu a vaga
						 * transforma em modelo sem redigitar.
						 */
						fromJobId: z.string().optional(),
					}),
					response: { 201: z.object({ id: z.string() }) },
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const userId = await request.getCurrentUser()
				const { fromJobId, ...data } = request.body
				const created = fromJobId
					? await service.createFromJob(company.id, userId, fromJobId, data.name)
					: await service.createTemplate(company.id, userId, data)
				return reply.status(201).send(created)
			},
		)
		.patch(
			'/companies/job-templates/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-templates'],
					security: [{ bearerAuth: [] }],
					summary: 'Update a job template',
					params: z.object({ id: z.string() }),
					body: contentSchema.extend({
						name: z.string().min(1).optional(),
						jobName: z.string().nullish(),
						description: z.string().nullish(),
					}),
					response: { 200: z.object({ success: z.boolean() }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				await service.updateTemplate(company.id, request.params.id, request.body)
				return { success: true }
			},
		)
		.delete(
			'/companies/job-templates/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['job-templates'],
					security: [{ bearerAuth: [] }],
					summary: 'Remove a job template',
					params: z.object({ id: z.string() }),
					response: { 200: z.object({ success: z.boolean() }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				await service.deactivateTemplate(company.id, request.params.id)
				return { success: true }
			},
		)
}
