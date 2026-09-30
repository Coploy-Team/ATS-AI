import { z } from 'zod'

// Schemas para a análise de autenticidade IA (detecção de cheat)

export const ResumoExecutivoSchema = z.object({
	pontuacao_autenticidade: z.number(),
	nivel_confianca: z.string(),
	parecer_principal: z.string(),
	fatores_criticos: z.array(z.string()),
})

export const IndicadorAutenticidadeSchema = z.object({
	tipo: z.string(),
	descricao: z.string(),
	peso: z.number(),
})

export const SinalSuspeitoSchema = z.object({
	tipo: z.string(),
	descricao: z.string(),
	severidade: z.string(),
})

export const AnaliseDetalhadaSchema = z.object({
	indicadores_autenticidade: z.array(IndicadorAutenticidadeSchema),
	sinais_suspeitos: z.array(SinalSuspeitoSchema),
	padroes_identificados: z.array(z.string()),
	consideracoes_contextuais: z.array(z.string()),
})

export const MetricasRespostaSchema = z.object({
	naturalidade: z.number(),
	personalizacao: z.number(),
	complexidade: z.number(),
	padroes_linguisticos: z.number(),
	contexto: z.number(),
})

export const AnaliseRespostaSchema = z.object({
	numero_pergunta: z.number(),
	resumo_pergunta: z.string(),
	metricas: MetricasRespostaSchema,
	observacoes: z.array(z.string()),
})

export const RecomendacoesSchema = z.object({
	nivel_risco: z.string(),
	acoes_sugeridas: z.array(z.string()),
	perguntas_validacao: z.array(z.string()),
	consideracoes_eticas: z.array(z.string()),
})

export const MetadataSchema = z.object({
	confiabilidade_analise: z.number(),
	limitacoes_aplicaveis: z.array(z.string()),
	versao_prompt: z.string(),
})

export const AnaliseIASchema = z.object({
	resumo_executivo: ResumoExecutivoSchema,
	analise_detalhada: AnaliseDetalhadaSchema,
	analise_por_resposta: z.array(AnaliseRespostaSchema),
	recomendacoes: RecomendacoesSchema,
	metadata: MetadataSchema,
})
