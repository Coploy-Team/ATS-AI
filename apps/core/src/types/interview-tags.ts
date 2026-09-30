
export type HardSkillDocument = {
	categoria?: string | null
	tag?: string | null
	area?: string | null
	pontuacao?: number | null
	nivel_evidencia?: string | null
	evidencia?: string | null
	contexto_uso?: string | null
	palavras_chave?: string[] | null
	tempo_experiencia?: string | null
	necessita_validacao?: boolean | null
}

export type SoftSkillDocument = {
	categoria?: string | null
	tag?: string | null
	pontuacao?: number | null
	evidencia?: string | null
	contexto?: string | null
	impacto?: string | null
}

export type SenioridadeDocument = {
	nivel_identificado?: string | null
	confianca_avaliacao?: number | null
	justificativa?: string | null
	fatores_principais?: string[] | null
}

export type PapelPotencialDocument = {
	papel?: string | null
	fit?: number | null
	justificativa?: string | null
}

export type MarketFitDocument = {
	tipos_empresa_ideais?: string[] | null
	porte_empresa?: string[] | null
	culturas_adequadas?: string[] | null
	papeis_potenciais?: PapelPotencialDocument[] | null
}

export type PerfilTecnicoDocument = {
	tipo?: string | null
	amplitude?: number | null
	profundidade?: number | null
	atualizacao?: string | null
}

export type PerfilComportamentalDocument = {
	tipo_predominante?: string | null
	trabalho_em_equipe?: number | null
	comunicacao?: number | null
	proatividade?: number | null
	resiliencia?: number | null
}

export type EstiloAprendizadoDocument = {
	tipo?: string | null
	velocidade?: string | null
	preferencia?: string | null
	curiosidade_tecnica?: number | null
}

export type ClassificacaoDocument = {
	perfil_tecnico?: PerfilTecnicoDocument
	perfil_comportamental?: PerfilComportamentalDocument
	estilo_aprendizado?: EstiloAprendizadoDocument
}

export type GapTecnicoDocument = {
	area?: string | null
	descricao?: string | null
	criticidade?: string | null
	recomendacao?: string | null
}

export type GapComportamentalDocument = {
	area?: string | null
	descricao?: string | null
	criticidade?: string | null
	recomendacao?: string | null
}

export type RedFlagDocument = {
	tipo?: string | null
	descricao?: string | null
	severidade?: string | null
	evidencia?: string | null
}

export type GapsDocument = {
	tecnicos?: GapTecnicoDocument[] | null
	comportamentais?: GapComportamentalDocument[] | null
	red_flags?: RedFlagDocument[] | null
}

export type ResumoExecutivoDocument = {
	pontos_fortes?: string[] | null
	pontos_desenvolvimento?: string[] | null
	recomendacao_final?: string | null
	score_geral?: number | null
}

export type InterviewTagsDocument = {
	interview_id?: string | null
	created_at?: Date | null
	job_name?: string | null
	hard_skills?: HardSkillDocument[] | null
	soft_skills?: SoftSkillDocument[] | null
	senioridade?: SenioridadeDocument | null
	market_fit?: MarketFitDocument | null
	classificacao?: ClassificacaoDocument | null
	gaps?: GapsDocument | null
	resumo_executivo?: ResumoExecutivoDocument | null
}
