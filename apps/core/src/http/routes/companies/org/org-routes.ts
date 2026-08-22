import {
	CUSTOM_FIELD_ENTITIES,
	CUSTOM_FIELD_TYPES,
	EMAIL_TEMPLATE_KINDS,
	EMAIL_TEMPLATE_VARIABLES,
	ORG_UNIT_KINDS,
} from '@coploy/domain'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { createAuth } from '@/http/routes/middlewares/auth'
import { createOrgService } from '@/lib/services/org-service'

const unitSchema = z.object({
	id: z.string(),
	companyId: z.string(),
	kind: z.enum(ORG_UNIT_KINDS),
	name: z.string(),
	externalCode: z.string().nullable().optional(),
	parentId: z.string().nullable().optional(),
	active: z.boolean(),
	path: z.string().optional(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
})

const fieldSchema = z.object({
	id: z.string(),
	companyId: z.string(),
	entity: z.enum(CUSTOM_FIELD_ENTITIES),
	key: z.string(),
	label: z.string(),
	type: z.enum(CUSTOM_FIELD_TYPES),
	options: z.array(z.string()).nullable().optional(),
	required: z.boolean(),
	order: z.number(),
	active: z.boolean(),
	createdAt: z.union([z.string(), z.date()]),
})

/** Estrutura organizacional e campos customizados (V2-501 / V2-502). */
export function orgRoutes(app: FastifyInstance) {
	const service = createOrgService(app.infra)
	app
		.withTypeProvider<ZodTypeProvider>()
		.register(createAuth(app.infra))
		.get(
			'/companies/org-units',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'List organizational units',
					response: { 200: z.object({ units: z.array(unitSchema) }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return service.listOrgUnits(company.id)
			},
		)
		.post(
			'/companies/org-units',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'Create an organizational unit',
					body: z.object({
						kind: z.enum(ORG_UNIT_KINDS),
						name: z.string().min(1).max(120),
						externalCode: z.string().max(60).nullable().optional(),
						parentId: z.string().nullable().optional(),
					}),
					response: { 201: z.object({ unit: unitSchema }) },
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const unit = await service.createOrgUnit({ companyId: company.id, ...request.body })
				return reply.status(201).send({ unit })
			},
		)
		/**
		 * Remover é DESATIVAR — e por isso é PATCH, não DELETE.
		 *
		 * Unidade usada por vaga antiga não pode sumir do histórico: relatório de
		 * seis meses atrás precisa continuar dizendo de que área era a vaga. O
		 * mesmo verbo restaura, porque criar errado e não ter volta é como a
		 * unidade "x" ficou presa na estrutura até aqui.
		 */
		.patch(
			'/companies/org-units/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'Activate or deactivate an organizational unit',
					params: z.object({ id: z.string() }),
					body: z.object({ active: z.boolean() }),
					response: { 200: z.object({ ok: z.boolean() }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				await service.setOrgUnitActive({
					companyId: company.id,
					id: request.params.id,
					active: request.body.active,
				})
				return { ok: true }
			},
		)
		.patch(
			'/companies/custom-fields/:id',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'Activate or deactivate a custom field',
					params: z.object({ id: z.string() }),
					body: z.object({ active: z.boolean() }),
					response: { 200: z.object({ ok: z.boolean() }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				await service.setCustomFieldActive({
					companyId: company.id,
					id: request.params.id,
					active: request.body.active,
				})
				return { ok: true }
			},
		)
		.get(
			'/companies/custom-fields',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'List custom field definitions',
					querystring: z.object({ entity: z.enum(CUSTOM_FIELD_ENTITIES).optional() }),
					response: { 200: z.object({ fields: z.array(fieldSchema) }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				return service.listCustomFields({ companyId: company.id, entity: request.query.entity })
			},
		)
		.post(
			'/companies/custom-fields',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'Define a custom field',
					body: z.object({
						entity: z.enum(CUSTOM_FIELD_ENTITIES),
						label: z.string().min(1).max(80),
						type: z.enum(CUSTOM_FIELD_TYPES),
						options: z.array(z.string()).nullable().optional(),
						required: z.boolean().default(false),
					}),
					response: { 201: z.object({ field: fieldSchema }) },
				},
			},
			async (request, reply) => {
				const { company } = await request.getUserMembership()
				const field = await service.createCustomField({ companyId: company.id, ...request.body })
				return reply.status(201).send({ field })
			},
		)
		.get(
			'/companies/email-templates',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'List company email templates',
					response: {
						200: z.object({
							templates: z.array(
								z.object({
									id: z.string(),
									companyId: z.string(),
									kind: z.enum(EMAIL_TEMPLATE_KINDS),
									subject: z.string(),
									body: z.string(),
									active: z.boolean(),
									updatedByUserId: z.string().nullable().optional(),
									/*
									 * Nullable: data que não deu para ler não invalida o
									 * template. Ela não é usada em lugar nenhum da tela, e
									 * derrubar a listagem inteira por causa dela foi
									 * exatamente o que aconteceu (400 com um template salvo).
									 */
									createdAt: z.union([z.string(), z.date()]).nullable(),
									updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
								}),
							),
							kinds: z.array(z.enum(EMAIL_TEMPLATE_KINDS)),
							/** As únicas variáveis que o produto garante. */
							variables: z.array(z.string()),
						}),
					},
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const result = await service.listEmailTemplates(company.id)
				return { ...result, variables: [...EMAIL_TEMPLATE_VARIABLES] }
			},
		)
		.put(
			'/companies/email-templates/:kind',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'Save a company email template',
					params: z.object({ kind: z.enum(EMAIL_TEMPLATE_KINDS) }),
					body: z.object({
						subject: z.string().min(1).max(200),
						body: z.string().min(1).max(8000),
					}),
					response: { 200: z.object({ ok: z.boolean() }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				const updatedByUserId = await request.getCurrentUser().catch(() => null)
				await service.saveEmailTemplate({
					companyId: company.id,
					kind: request.params.kind,
					updatedByUserId,
					...request.body,
				})
				return { ok: true }
			},
		)
		.delete(
			'/companies/email-templates/:kind',
			{
				schema: {
					'x-surface': 'empresa',
					tags: ['org'],
					security: [{ bearerAuth: [] }],
					summary: 'Restore the default copy for an email template',
					params: z.object({ kind: z.enum(EMAIL_TEMPLATE_KINDS) }),
					response: { 200: z.object({ ok: z.boolean() }) },
				},
			},
			async (request) => {
				const { company } = await request.getUserMembership()
				await service.resetEmailTemplate({
					companyId: company.id,
					kind: request.params.kind,
				})
				return { ok: true }
			},
		)
}
