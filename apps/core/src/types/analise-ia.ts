// Tipos para análise de autenticidade IA

export interface IndicadorAutenticidade {
	tipo: string
	descricao: string
	peso: number
}

export interface SinalSuspeito {
	tipo: string
	descricao: string
	severidade: string
}

export interface ResumoExecutivo {
	pontuacao_autenticidade: number
	nivel_confianca: string
	parecer_principal: string
	fatores_criticos: string[]
}

export interface AnaliseDetalhada {
	indicadores_autenticidade: IndicadorAutenticidade[]
	sinais_suspeitos: SinalSuspeito[]
	padroes_identificados: string[]
	consideracoes_contextuais: string[]
}

export interface MetricasResposta {
	naturalidade: number
	personalizacao: number
	complexidade: number
	padroes_linguisticos: number
	contexto: number
}

export interface AnaliseResposta {
	numero_pergunta: number
	resumo_pergunta: string
	metricas: MetricasResposta
	observacoes: string[]
}

export interface Recomendacoes {
	nivel_risco: string
	acoes_sugeridas: string[]
	perguntas_validacao: string[]
	consideracoes_eticas: string[]
}

export interface Metadata {
	confiabilidade_analise: number
	limitacoes_aplicaveis: string[]
	versao_prompt: string
}

export interface AnaliseIA {
	resumo_executivo: ResumoExecutivo
	analise_detalhada: AnaliseDetalhada
	analise_por_resposta: AnaliseResposta[]
	recomendacoes: Recomendacoes
	metadata: Metadata
}
