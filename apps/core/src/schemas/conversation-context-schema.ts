import { z } from 'zod'

export const conversationStepSchema = z.enum([
	'start_interview',
	'waiting_interview',
	'waiting_name',
	'waiting_email',
	'waiting_password',
	'confirm_password',
	'confirm_interview',
	'ask_next_question',
	'waiting_answer',
	'confirm_answer',
	'finished',
])

export const conversationStatusSchema = z.enum([
	'active',
	'inactive',
	'blocked',
])

export const conversationActionSchema = z.enum([
	'ask_email',
	'ask_password',
	'next_question',
	'retry_answer',
	'finish',
	'start_interview',
	'invalid_input',
	'user_blocked',
])

export const createConversationContextSchema = z.object({
	phone: z
		.string()
		.min(10, 'Número de telefone deve ter pelo menos 10 dígitos'),
	step: conversationStepSchema.default('start_interview'),
	email: z.string().email().nullable().optional(),
	password: z.string().min(6).nullable().optional(),
	interviewId: z.string().nullable().optional(),
	jobId: z.string().nullable().optional(),
	companyId: z.string().nullable().optional(),
	currentQuestionId: z.string().nullable().optional(),
	lastMessage: z.string().default(''),
	status: conversationStatusSchema.default('active'),
	retryCount: z.number().min(0).default(0),
	maxRetries: z.number().min(1).default(3),
})

export const updateConversationContextSchema = z.object({
	step: conversationStepSchema.optional(),
	email: z.string().email().nullable().optional(),
	password: z.string().min(6).nullable().optional(),
	interviewId: z.string().nullable().optional(),
	currentQuestionId: z.string().nullable().optional(),
	lastMessage: z.string().optional(),
	status: conversationStatusSchema.optional(),
	retryCount: z.number().min(0).optional(),
	maxRetries: z.number().min(1).optional(),
})

export const processMessageSchema = z.object({
	phone: z
		.string()
		.min(10, 'Número de telefone deve ter pelo menos 10 dígitos'),
	message: z.string().min(1, 'Mensagem não pode estar vazia'),
})

const contextSchema = z.object({
	id: z.string(),
	phone: z.string(),
	step: conversationStepSchema,
	email: z.string().nullable(),
	password: z.string().nullable(),
	interviewId: z.string().nullable(),
	currentQuestionId: z.string().nullable(),
	lastMessage: z.string(),
	status: conversationStatusSchema,
	retryCount: z.number(),
	maxRetries: z.number(),
})

export const conversationResponseSchema = z.object({
	reply: z.string(),
	action: conversationActionSchema,
	context: contextSchema.optional(),
})
