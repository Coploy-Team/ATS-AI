import { z } from 'zod'

export const engineTokenUsageSchema = z.object({
	promptTokens: z.number(),
	completionTokens: z.number(),
	totalTokens: z.number(),
	cachedPromptTokens: z.number().optional(),
})

export const engineFinalAnalysisUsageSchema = z.object({
	step1_extractScore: engineTokenUsageSchema,
	step2_competencies: engineTokenUsageSchema,
	step3_finalAnalysis: engineTokenUsageSchema,
	total: engineTokenUsageSchema,
})

export const engineFinalAnalysisResultSchema = z.object({
	sCom: z.number().optional(),
	sRes: z.number().optional(),
	sTec: z.number().optional(),
	generalFeedback: z.string(),
	generalRecomendation: z.string(),
	generalStrengths: z.array(z.string()),
	generalImprovement: z.array(z.string()),
	score: z.number(),
})

export const engineFinalAnalysisResponseSchema = z.object({
	success: z.boolean(),
	processingTimeMs: z.number(),
	model: z.string(),
	provider: z.enum(['openai', 'minimax']).optional(),
	extractedScore: z.number(),
	usage: engineFinalAnalysisUsageSchema,
	result: engineFinalAnalysisResultSchema,
})

export type EngineFinalAnalysisResponse = z.infer<
	typeof engineFinalAnalysisResponseSchema
>
