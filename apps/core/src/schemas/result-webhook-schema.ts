import { z } from 'zod'

export const ResultWebhookSchema = z.object({
	id: z.string(),
	companyId: z.string().nullable().optional(),
	name: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	method: z.string().nullable().optional(),
	headers: z.any().nullable().optional(),
	/** Eventos assinados (V2-504). Ausente = legado: só `interview.finished`. */
	events: z.array(z.string()).nullable().optional(),
	approvalThreshold: z.number().nullable().optional(),
	onlyOnApproval: z.boolean().nullable().optional(),
	enabled: z.boolean().nullable().optional(),
	createdAt: z.any().nullable().optional(),
	updatedAt: z.any().nullable().optional(),
})

export const CreateResultWebhookBodySchema = z.object({
	name: z.string().min(1, 'Nome é obrigatório'),
	url: z.string().min(1, 'URL é obrigatória'),
	method: z.enum(['POST', 'PATCH', 'PUT']).default('POST'),
	headers: z.any().nullable().optional(),
	events: z.array(z.string()).nullable().optional(),
	approvalThreshold: z.number().min(0).max(10).nullable().optional(),
	onlyOnApproval: z.boolean().nullable().optional(),
	enabled: z.boolean().nullable().optional(),
})

export const UpdateResultWebhookBodySchema = CreateResultWebhookBodySchema.partial()

export const TestResultWebhookBodySchema = z.object({
	url: z.string().min(1, 'URL é obrigatória'),
	method: z.enum(['POST', 'PATCH', 'PUT']).default('POST'),
	headers: z.any().nullable().optional(),
})
