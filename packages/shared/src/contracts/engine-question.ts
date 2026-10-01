import { z } from 'zod'
import { engineTokenUsageSchema } from './engine-analysis'

export const engineQuestionAnalysisUsageSchema = z.object({
	step1_maxScore: engineTokenUsageSchema,
	step2_competencies: engineTokenUsageSchema,
	step3_analysis: engineTokenUsageSchema,
	total: engineTokenUsageSchema,
})

export const engineQuestionCompetencyScoreSchema = z.object({
	competencia: z.string(),
	score: z.number(),
})

export const engineQuestionScoreDetalhadoSchema = z.object({
	competencias_criticas: z.array(engineQuestionCompetencyScoreSchema),
	competencias_adicionais: z.array(engineQuestionCompetencyScoreSchema),
	qualidade_resposta: z.object({
		profundidade: z.number(),
		estruturacao: z.number(),
		exemplificacao: z.number(),
	}),
	indicadores_senioridade: z.object({
		alinhamento_nivel: z.number(),
		gap_para_proximo_nivel: z.number(),
		pontos_destaque_senioridade: z.array(z.string()),
	}),
	adequacao_vaga: z.object({
		requisitos_atendidos: z.number(),
		alinhamento_responsabilidades: z.number(),
		aderencia_descricao: z.number(),
	}),
})

export const engineQuestionMetricasDecisaoSchema = z.object({
	nivel_confianca: z.number(),
	necessidade_validacao_adicional: z.boolean(),
})

export const engineQuestionAnalysisResultSchema = z.object({
	score: z.number(),
	score_detalhado: engineQuestionScoreDetalhadoSchema,
	qFeedback: z.string(),
	qRecomendation: z.string(),
	strengths: z.array(z.string()),
	improvement: z.array(z.string()),
	metricas_decisao: engineQuestionMetricasDecisaoSchema,
})

export const engineQuestionAnalysisResponseSchema = z.object({
	success: z.boolean(),
	processingTimeMs: z.number(),
	model: z.string(),
	provider: z.enum(['openai', 'minimax']).optional(),
	usage: engineQuestionAnalysisUsageSchema,
	result: engineQuestionAnalysisResultSchema,
})

export type EngineQuestionAnalysisResponse = z.infer<
	typeof engineQuestionAnalysisResponseSchema
>
