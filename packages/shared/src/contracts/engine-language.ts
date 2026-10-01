import { z } from 'zod'
import { engineTokenUsageSchema } from './engine-analysis'

export const engineLanguageAnalysisResultSchema = z.object({
	score: z.number(),
	feedback: z.string(),
	analise: z.string(),
})

export const engineLanguageAnalysisUsageSchema = z.object({
	step1_maxScore: engineTokenUsageSchema,
	step2_analysis: engineTokenUsageSchema,
	total: engineTokenUsageSchema,
})

export const engineLanguageAnalysisResponseSchema = z.object({
	success: z.boolean(),
	processingTimeMs: z.number(),
	model: z.string(),
	provider: z.enum(['openai', 'minimax']).optional(),
	usage: engineLanguageAnalysisUsageSchema,
	result: engineLanguageAnalysisResultSchema,
})

// Compatibilidade com payload legado (sem envelope success/result)
export const engineLanguageAnalysisLegacyResponseSchema =
	engineLanguageAnalysisResultSchema

export const engineLanguageAnalysisAnyResponseSchema = z.union([
	engineLanguageAnalysisResponseSchema,
	engineLanguageAnalysisLegacyResponseSchema,
])

export type EngineLanguageAnalysisResponse = z.infer<
	typeof engineLanguageAnalysisResponseSchema
>

// ============================================================================
// FINAL ANALYSIS (consolidated feedback after all questions are scored)
// ============================================================================

export const engineLanguageFinalResultSchema = z.object({
	feedback: z.string(),
	analise: z.string(),
	fluencia: z.string(),
	score: z
		.union([z.string(), z.number()])
		.transform((val) =>
			typeof val === 'string' ? Number.parseFloat(val) : val,
		),
})

export const engineLanguageFinalUsageSchema = z.object({
	step1_extractScore: engineTokenUsageSchema,
	step2_analysis: engineTokenUsageSchema,
	total: engineTokenUsageSchema,
})

export const engineLanguageFinalResponseSchema = z.object({
	success: z.boolean(),
	processingTimeMs: z.number(),
	model: z.string(),
	provider: z.enum(['openai', 'minimax']).optional(),
	extractedScore: z.number(),
	usage: engineLanguageFinalUsageSchema,
	result: engineLanguageFinalResultSchema,
})

export type EngineLanguageFinalResponse = z.infer<
	typeof engineLanguageFinalResponseSchema
>
