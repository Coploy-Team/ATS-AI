import { z } from 'zod'

export const GupyIntegrationSchema = z.object({
	id: z.string(),
	companyId: z.string().nullable().optional(),
	gupyApiToken: z.string().nullable().optional(),
	companyName: z.string().nullable().optional(),
	emailHtmlTemplate: z.string().nullable().optional(),
	interviewBaseUrl: z.string().nullable().optional(),
	stepName: z.string().nullable().optional(),
	sentTagName: z.string().nullable().optional(),
	sentTagColor: z.string().nullable().optional(),
	scoreTagPrefix: z.string().nullable().optional(),
	scoreTagColor: z.string().nullable().optional(),
	techTestFieldLabel: z.string().nullable().optional(),
	techTestFieldValue: z.string().nullable().optional(),
	careerLevelFieldLabel: z.string().nullable().optional(),
	defaultCareerLevel: z.string().nullable().optional(),
	defaultLanguage: z.string().nullable().optional(),
	questionCount: z.number().nullable().optional(),
	sendCommentOnFinish: z.boolean().nullable().optional(),
	commentTemplate: z.string().nullable().optional(),
	sendCandidateEmail: z.boolean().nullable().optional(),
	syncLookbackDays: z.number().nullable().optional(),
	autoSyncOnFinish: z.boolean().nullable().optional(),
	enabled: z.boolean().nullable().optional(),
})

export const CreateGupyIntegrationBodySchema = z.object({
	gupyApiToken: z.string().min(1, 'Token da API Gupy é obrigatório'),
	companyName: z.string().nullable().optional(),
	emailHtmlTemplate: z.string().nullable().optional(),
	interviewBaseUrl: z.string().nullable().optional(),
	stepName: z.string().nullable().optional(),
	sentTagName: z.string().nullable().optional(),
	sentTagColor: z.string().nullable().optional(),
	scoreTagPrefix: z.string().nullable().optional(),
	scoreTagColor: z.string().nullable().optional(),
	techTestFieldLabel: z.string().nullable().optional(),
	techTestFieldValue: z.string().nullable().optional(),
	careerLevelFieldLabel: z.string().nullable().optional(),
	defaultCareerLevel: z.string().nullable().optional(),
	defaultLanguage: z.string().nullable().optional(),
	questionCount: z.number().nullable().optional(),
	sendCommentOnFinish: z.boolean().nullable().optional(),
	commentTemplate: z.string().nullable().optional(),
	sendCandidateEmail: z.boolean().nullable().optional(),
	syncLookbackDays: z.number().nullable().optional(),
	autoSyncOnFinish: z.boolean().nullable().optional(),
	enabled: z.boolean().nullable().optional(),
})

export const UpdateGupyIntegrationBodySchema = CreateGupyIntegrationBodySchema.partial()

export const TestConnectionBodySchema = z.object({
	gupyApiToken: z.string().min(1, 'Token da API Gupy é obrigatório'),
})

export const CheckWebhooksBodySchema = z.object({
	gupyApiToken: z.string().min(1, 'Token da API Gupy é obrigatório'),
})

export const RegisterWebhookBodySchema = z.object({
	gupyApiToken: z.string().min(1, 'Token da API Gupy é obrigatório'),
	companyId: z.string().min(1, 'Company ID é obrigatório'),
})

export const GupyWebhookSchema = z.object({
	id: z.string(),
	action: z.string(),
	postbackUrl: z.string(),
	clientHeaders: z.record(z.string()).optional(),
})
