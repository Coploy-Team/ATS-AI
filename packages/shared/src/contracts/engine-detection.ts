import { z } from 'zod'
import { engineTokenUsageSchema } from './engine-analysis'

export const engineDetectionResumoExecutivoSchema = z.object({
	pontuacao_autenticidade: z.number(),
	nivel_confianca: z.string(),
	parecer_principal: z.string(),
	fatores_criticos: z.array(z.string()),
})

export const engineDetectionAnaliseDetalhadaSchema = z.object({
	indicadores_autenticidade: z.array(
		z.object({
			tipo: z.string(),
			descricao: z.string(),
			peso: z.number(),
		}),
	),
	sinais_suspeitos: z.array(
		z.object({
			tipo: z.string(),
			descricao: z.string(),
			severidade: z.string(),
		}),
	),
	padroes_identificados: z.array(z.string()),
	consideracoes_contextuais: z.array(z.string()),
})

export const engineDetectionAnalisePorRespostaSchema = z.array(
	z.object({
		numero_pergunta: z.number(),
		resumo_pergunta: z.string(),
		metricas: z.object({
			naturalidade: z.number(),
			personalizacao: z.number(),
			complexidade: z.number(),
			padroes_linguisticos: z.number(),
			contexto: z.number(),
		}),
		observacoes: z.array(z.string()),
	}),
)

export const engineDetectionResultSchema = z.object({
	resumo_executivo: engineDetectionResumoExecutivoSchema,
	analise_detalhada: engineDetectionAnaliseDetalhadaSchema,
	analise_por_resposta: engineDetectionAnalisePorRespostaSchema,
})

export const engineDetectionResponseSchema = z.object({
	success: z.boolean(),
	processingTimeMs: z.number(),
	model: z.string(),
	provider: z.enum(['openai', 'minimax']).optional(),
	usage: engineTokenUsageSchema,
	result: engineDetectionResultSchema,
})

export type EngineDetectionResponse = z.infer<typeof engineDetectionResponseSchema>
