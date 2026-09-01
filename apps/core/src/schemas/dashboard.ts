import { z } from 'zod'

export const dashboardHomeSchema = z.object({
	month: z.coerce.number().min(1).max(12).optional(),
	year: z.coerce.number().min(2000).max(2100).optional(),
})

export type DashboardHomeParams = z.infer<typeof dashboardHomeSchema>

const dashboardJobItemSchema = z.object({
	id: z.string(),
	jobId: z.string(),
	jobName: z.string(),
	timeCreated: z.date().nullable(),
	typeInterview: z.string(),
})

const dashboardInterviewItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	date: z.date().nullable(),
	dateSelect: z.date().nullable(),
	finished: z.boolean(),
	typeInterview: z.string(),
})

export const dashboardHomeResponseSchema = z.object({
	jobs: z.object({
		total: z.number(),
		items: z.array(dashboardJobItemSchema),
	}),
	interviews: z.object({
		total: z.number(),
		items: z.array(dashboardInterviewItemSchema),
	}),
	approved: z.object({
		total: z.number(),
		items: z.array(dashboardInterviewItemSchema),
	}),
	// Score médio das entrevistas finalizadas no mês (com score > 0).
	// Reflete qualidade do que entrou no funil — independente de
	// quantos foram aprovados ou rejeitados.
	scoreAvg: z.object({
		value: z.number(), // 0–10; 0 quando não há entrevistas pontuadas
		sampleSize: z.number(), // qtd de entrevistas com score > 0
	}),
})

export type DashboardHomeResponse = z.infer<typeof dashboardHomeResponseSchema>
